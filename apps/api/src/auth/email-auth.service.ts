import {Inject,Injectable} from '@nestjs/common';
import {and,eq,isNotNull,isNull,sql} from 'drizzle-orm';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import QRCode from 'qrcode';
import {permissionsFor,type Role} from '@manage/shared';
import {AuditService} from '../audit/audit.service';
import {AppError,forbidden} from '../common/errors';
import {newId} from '../common/ids';
import {APP_CONFIG,type AppConfig} from '../config';
import {DATABASE,type DatabaseHandle,type Tx} from '../db/database';
import {authChallenges,tenants,users} from '../db/schema';
import {DEMO_TENANT_CODE} from '../demo/demo-seed.service';
import {AuthService} from './auth.service';
import type {Actor} from './auth.types';
import type {EmailLoginInput,EmailVerifyInput,InvitationInput,PasswordSetInput} from './email.contracts';
import {hashPassword,verifyPassword} from './password';
import {authenticator,decryptTotp,encryptTotp,newTotpSeed,totpStep} from './totp';

type Meta={ip?:string;requestId?:string;userAgent?:string};
const invalid=()=>new AppError(401,'INVALID_CREDENTIALS','ایمیل، رمز یا کد تأیید معتبر نیست');
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
@Injectable()
export class EmailAuthService {
  private readonly dummy=hashPassword(randomBytes(32).toString('hex'));
  constructor(@Inject(DATABASE) private readonly handle:DatabaseHandle,@Inject(APP_CONFIG) private readonly cfg:AppConfig,
    private readonly auth:AuthService,private readonly audit:AuditService){}
  private get db(){return this.handle.db;}
  private key(){if(!this.cfg.AUTH_TOKEN_SECRET)throw new AppError(503,'AUTH_NOT_CONFIGURED','ورود شخصی هنوز فعال نشده است');return this.cfg.AUTH_TOKEN_SECRET;}
  private hash(purpose:string,id:string,value:string){return createHmac('sha256',this.key()).update(`${purpose}:${id}:${value}`).digest('hex');}
  private async actor(tx:Tx,userId:string,meta:Meta={}):Promise<Actor>{
    const [r]=await tx.select({u:users,t:tenants}).from(users).innerJoin(tenants,eq(tenants.id,users.tenantId)).where(eq(users.id,userId));
    if(!r)throw invalid();const roles=r.u.roles as Role[];
    return {ip:meta.ip,requestId:meta.requestId,user:{id:userId,tenantId:r.t.id,tenantCode:r.t.code,tenantName:r.t.name,isTestTenant:r.t.isTest,
      username:r.u.username,displayName:r.u.displayName,roles,permissions:permissionsFor(roles),sessionId:'pending-authenticator'}};
  }
  private async record(tx:Tx,userId:string,action:string,meta:Meta={}){await this.audit.record(tx,await this.actor(tx,userId,meta),{entityType:'user',entityId:userId,action});}

  async start(input:EmailLoginInput,meta:Meta){
    const [u]=await this.db.select().from(users).where(eq(users.email,input.email));
    const ok=await verifyPassword(input.password,u?.passwordHash??await this.dummy);
    if(!u||!u.isActive||!u.encryptedTotpSecret)throw invalid();
    const id=newId(),proof=randomBytes(32).toString('base64url');
    const status=await this.db.transaction(async tx=>{
      const [current]=await tx.select().from(users).where(eq(users.id,u.id)).for('update');
      if(current.lockedUntil&&current.lockedUntil>new Date())return 'locked';
      if(!ok||current.passwordHash!==u.passwordHash||!current.isActive){
        const n=current.failedLoginCount+1;
        await tx.update(users).set({failedLoginCount:n>=5?0:n,lockedUntil:n>=5?new Date(Date.now()+15*60000):null}).where(eq(users.id,u.id));
        await this.record(tx,u.id,'auth.password_failed',meta);return 'invalid';
      }
      await tx.update(authChallenges).set({consumedAt:new Date()}).where(and(eq(authChallenges.userId,u.id),eq(authChallenges.purpose,'login'),isNull(authChallenges.consumedAt)));
      await tx.insert(authChallenges).values({id,userId:u.id,tenantId:u.tenantId,purpose:'login',secretHash:this.hash('proof',id,proof),expiresAt:new Date(Date.now()+5*60000)});
      await this.record(tx,u.id,'auth.totp_requested',meta);return 'ok';
    });
    if(status==='locked')throw new AppError(429,'ACCOUNT_LOCKED','حساب موقتاً قفل شده است؛ ۱۵ دقیقه دیگر تلاش کنید');
    if(status!=='ok')throw invalid();return {challengeId:id,proof,expiresIn:300};
  }

  async verify(input:EmailVerifyInput,meta:Meta){
    const [candidate]=await this.db.select().from(authChallenges).where(eq(authChallenges.id,input.challengeId));
    if(!candidate)throw invalid();
    const result=await this.db.transaction(async tx=>{
      // All authentication flows lock user first, challenge second.
      const [u]=await tx.select().from(users).where(eq(users.id,candidate.userId)).for('update');
      const [c]=await tx.select().from(authChallenges).where(eq(authChallenges.id,input.challengeId)).for('update');
      if(!u?.isActive||!u.encryptedTotpSecret||!c||c.purpose!=='login'||c.consumedAt||c.expiresAt<=new Date()||c.attempts>=5||!equal(c.secretHash,this.hash('proof',c.id,input.proof)))return null;
      if(u.lockedUntil&&u.lockedUntil>new Date())return null;
      const step=totpStep(decryptTotp(u.encryptedTotpSecret,this.key()),input.code,u.totpLastStep);
      if(step===null){
        await tx.update(authChallenges).set({attempts:c.attempts+1,consumedAt:c.attempts+1>=5?new Date():null}).where(eq(authChallenges.id,c.id));
        const n=u.failedLoginCount+1;
        await tx.update(users).set({failedLoginCount:n>=5?0:n,lockedUntil:n>=5?new Date(Date.now()+15*60000):null}).where(eq(users.id,u.id));
        await this.record(tx,u.id,'auth.totp_failed',meta);return null;
      }
      await tx.update(users).set({totpLastStep:step}).where(eq(users.id,u.id));
      await tx.update(authChallenges).set({consumedAt:new Date()}).where(eq(authChallenges.id,c.id));
      return this.auth.issueTotpSession(tx,u.id,meta);
    });
    if(!result)throw invalid();return result;
  }

  async invite(actor:Actor,input:InvitationInput){
    if(!actor.user.permissions.has('user.manage'))throw forbidden();
    const id=newId(),raw=randomBytes(32).toString('base64url'),passwordHash=await hashPassword(randomBytes(32).toString('hex'));
    const userId=await this.db.transaction(async tx=>{
      const [existing]=await tx.select().from(users).where(and(eq(users.email,input.email),eq(users.tenantId,actor.user.tenantId))).for('update');
      if(existing&&(existing.tenantId!==actor.user.tenantId||existing.isActive))throw new AppError(409,'INVITE_EXISTS','این ایمیل قبلاً برای حساب دیگری ثبت شده است');
      const uid=existing?.id??newId();
      if(existing)await tx.update(users).set({displayName:input.displayName,roles:input.roles,version:sql`${users.version}+1`,updatedAt:new Date()}).where(eq(users.id,uid));
      else await tx.insert(users).values({id:uid,tenantId:actor.user.tenantId,username:`email-${uid}`,email:input.email,displayName:input.displayName,passwordHash,roles:input.roles,isActive:false,isTest:actor.user.isTestTenant});
      await tx.update(authChallenges).set({consumedAt:new Date()}).where(and(eq(authChallenges.userId,uid),isNull(authChallenges.consumedAt)));
      await tx.insert(authChallenges).values({id,userId:uid,tenantId:actor.user.tenantId,purpose:'invite',secretHash:this.hash('invite',id,raw),expiresAt:new Date(Date.now()+24*3600000)});
      await this.audit.record(tx,actor,{entityType:'user',entityId:uid,action:'user.invited',after:{roles:input.roles}});return uid;
    }).catch((error:unknown)=>{
      const e=error as {code?:string;cause?:{code?:string}};
      if(e.code==='23505'||e.cause?.code==='23505')throw new AppError(409,'INVITE_EXISTS','ساخت دعوت‌نامه برای این ایمیل ممکن نیست');
      throw error;
    });
    return {id:userId,invitationUrl:`${this.cfg.PUBLIC_APP_URL.replace(/\/$/,'')}/activate#token=${id}.${raw}`,status:'invited'};
  }

  async enroll(input:PasswordSetInput,meta:Meta){
    const [id,raw]=input.token.split('.');
    const [candidate]=await this.db.select().from(authChallenges).where(eq(authChallenges.id,id!));
    if(!candidate)throw invalid();
    const seed=newTotpSeed(),encryptedTotpSecret=encryptTotp(seed,this.key()),passwordHash=await hashPassword(input.password);
    const enrollmentId=newId(),proof=randomBytes(32).toString('base64url');
    const email=await this.db.transaction(async tx=>{
      const [u]=await tx.select().from(users).where(eq(users.id,candidate.userId)).for('update');
      const [c]=await tx.select().from(authChallenges).where(eq(authChallenges.id,id!)).for('update');
      if(!u||u.isActive||!c||c.purpose!=='invite'||c.consumedAt||c.expiresAt<=new Date()||!equal(c.secretHash,this.hash('invite',c.id,raw!)))return null;
      await tx.update(authChallenges).set({consumedAt:new Date()}).where(eq(authChallenges.id,c.id));
      await tx.insert(authChallenges).values({id:enrollmentId,userId:u.id,tenantId:u.tenantId,purpose:'enroll',secretHash:this.hash('proof',enrollmentId,proof),passwordHash,encryptedTotpSecret,expiresAt:new Date(Date.now()+10*60000)});
      await this.record(tx,u.id,'auth.totp_enrollment_started',meta);return u.email;
    });
    if(!email)throw invalid();
    const uri=authenticator(seed,email).toString();
    return {challengeId:enrollmentId,proof,secret:seed,qrDataUrl:await QRCode.toDataURL(uri,{errorCorrectionLevel:'M',width:260,margin:2})};
  }

  async confirmEnrollment(input:EmailVerifyInput,meta:Meta){
    const [candidate]=await this.db.select().from(authChallenges).where(eq(authChallenges.id,input.challengeId));if(!candidate)throw invalid();
    const ok=await this.db.transaction(async tx=>{
      const [u]=await tx.select().from(users).where(eq(users.id,candidate.userId)).for('update');
      const [c]=await tx.select().from(authChallenges).where(eq(authChallenges.id,input.challengeId)).for('update');
      if(!u||u.isActive||!c||c.purpose!=='enroll'||c.consumedAt||c.expiresAt<=new Date()||c.attempts>=5||!c.encryptedTotpSecret||!c.passwordHash||!equal(c.secretHash,this.hash('proof',c.id,input.proof)))return false;
      const step=totpStep(decryptTotp(c.encryptedTotpSecret,this.key()),input.code,-1);
      if(step===null){await tx.update(authChallenges).set({attempts:c.attempts+1}).where(eq(authChallenges.id,c.id));await this.record(tx,u.id,'auth.enrollment_code_failed',meta);return false;}
      await tx.update(users).set({passwordHash:c.passwordHash,encryptedTotpSecret:c.encryptedTotpSecret,totpLastStep:step,isActive:true,activatedAt:new Date(),updatedAt:new Date(),version:sql`${users.version}+1`}).where(eq(users.id,u.id));
      await tx.update(authChallenges).set({consumedAt:new Date()}).where(and(eq(authChallenges.userId,u.id),isNull(authChallenges.consumedAt)));
      await this.record(tx,u.id,'auth.totp_enrolled',meta);return true;
    });
    if(!ok)throw invalid();return {status:'ok'};
  }
  async list(actor:Actor){return this.db.select({id:users.id,email:users.email,displayName:users.displayName,roles:users.roles,isActive:users.isActive})
    .from(users).where(and(eq(users.tenantId,actor.user.tenantId),isNotNull(users.email)));}
  async bootstrapOwner(email:string){
    if(!['development','preview'].includes(this.cfg.APP_ENV))throw forbidden();
    const [existing]=await this.db.select().from(users).where(isNotNull(users.email)).limit(1);
    if(existing&&(existing.email!==email||existing.isActive))throw new AppError(409,'OWNER_EXISTS','حساب مالک قبلاً ایجاد شده است');
    const [t]=await this.db.select().from(tenants).where(eq(tenants.code,DEMO_TENANT_CODE));
    const [admin]=t?await this.db.select({id:users.id}).from(users).where(and(eq(users.tenantId,t.id),eq(users.username,'admin'))):[];
    if(!t?.isTest||!admin)throw forbidden();
    return this.invite(await this.db.transaction(tx=>this.actor(tx,admin.id)),{email,displayName:'مالک Manage',roles:['system_admin','service_manager']});
  }
}
