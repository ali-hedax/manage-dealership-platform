import request from 'supertest';
import {eq} from 'drizzle-orm';
import {createHarness,type Harness,TEST_PASSWORD} from './harness';
import {APP_CONFIG,type AppConfig} from '../src/config';
import {authChallenges,idempotencyKeys,tenants,users} from '../src/db/schema';
import {newId} from '../src/common/ids';
import {authenticator,decryptTotp,encryptTotp,totpStep} from '../src/auth/totp';
import {purgeTestTenants} from '../src/demo/demo-reset';

const KEY='synthetic-test-authenticator-key-32-characters';
const PASSWORD='personal-test-password-12';
describe('Personal password + Authenticator sign-in',()=>{
  let h:Harness;
  beforeEach(async()=>{h=await createHarness({config:{AUTH_TOKEN_SECRET:KEY,COOKIE_SECURE:'true',PUBLIC_APP_URL:'https://manage.example.test'}});});
  afterEach(async()=>{jest.restoreAllMocks();await h.close();});
  const post=(path:string,body:object)=>request(h.app.getHttpServer()).post('/api/v1/auth'+path).set('x-manage-client','test').send(body);
  async function invitation(email='owner@example.test'){
    const admin=await h.login('admin');
    const r=await admin.post('/auth/invitations',{email,displayName:'کاربر آزمون',roles:['system_admin','service_manager']}).set('idempotency-key','sensitive-response');
    expect(r.status).toBe(201);
    return new URLSearchParams(new URL(r.body.invitationUrl).hash.slice(1)).get('token')!;
  }
  async function enrollment(){const token=await invitation();const r=await post('/invitations/accept',{token,password:PASSWORD});expect(r.status).toBe(201);return {token,...r.body} as {token:string;secret:string;challengeId:string;proof:string;qrDataUrl:string};}
  function wrong(seed:string){for(let i=0;i<100;i++){const c=String(i).padStart(6,'0');if(authenticator(seed).validate({token:c,window:1})===null)return c;}throw new Error('no invalid synthetic code');}
  it('uses the RFC 6238 SHA1 vector and authenticates encrypted seed storage',()=>{
    const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(authenticator(secret).generate({timestamp:59000})).toBe('287082');
    expect(totpStep(secret,'287082',-1,59000)).toBe(1);
    expect(totpStep(secret,'287082',1,59000)).toBeNull();
    const stored=encryptTotp(secret,KEY);expect(stored).not.toContain(secret);expect(decryptTotp(stored,KEY)).toBe(secret);
    expect(()=>decryptTotp(stored,KEY+'wrong')).toThrow();
  });
  it('requires an administrator and never caches invitation secrets',async()=>{
    const manager=await h.login('manager');
    expect((await manager.post('/auth/invitations',{email:'worker@example.test',displayName:'آزمون',roles:['parts_clerk']})).status).toBe(403);
    await invitation();
    expect(await h.db.db.select().from(idempotencyKeys)).toHaveLength(0);
    const [u]=await h.db.db.select().from(users).where(eq(users.email,'owner@example.test'));expect(u.isActive).toBe(false);
    expect((await post('/email/login',{email:'owner@example.test',password:PASSWORD})).status).toBe(401);
    await expect(purgeTestTenants(h.db.db)).rejects.toThrow('personal accounts');
  });
  it('requires QR enrollment and a fresh one-use TOTP before issuing a session',async()=>{
    const e=await enrollment();expect(e.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const [pending]=await h.db.db.select().from(authChallenges).where(eq(authChallenges.id,e.challengeId));
    expect(pending.encryptedTotpSecret).not.toContain(e.secret);expect(pending.passwordHash).not.toContain(PASSWORD);
    expect((await post('/invitations/accept',{token:e.token,password:PASSWORD})).status).toBe(401);
    expect((await post('/invitations/confirm',{challengeId:e.challengeId,proof:e.proof,code:wrong(e.secret)})).status).toBe(401);
    const code=authenticator(e.secret).generate();
    expect((await post('/invitations/confirm',{challengeId:e.challengeId,proof:e.proof,code})).status).toBe(201);
    const legacy=await h.login('manager');
    h.app.get<AppConfig>(APP_CONFIG).TOTP_AUTH_ENABLED=true;
    expect((await legacy.get('/auth/me')).status).toBe(401);
    expect((await post('/login',{username:'manager',password:TEST_PASSWORD})).status).toBe(403);
    let step=await post('/email/login',{email:'owner@example.test',password:PASSWORD});expect(step.status).toBe(201);
    expect(step.headers['set-cookie']).toBeUndefined();
    expect((await post('/email/verify',{...step.body,code})).status).toBe(401);
    const nextCode=authenticator(e.secret).generate({timestamp:Date.now()+30000});
    const verified=await post('/email/verify',{...step.body,code:nextCode});expect(verified.status).toBe(201);
    expect(verified.headers['set-cookie'][0]).toContain('Secure');expect(verified.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(verified.body.roles).toContain('system_admin');
    expect(verified.body.authentication).toBe('totp');
    expect((await post('/email/verify',{...step.body,code:nextCode})).status).toBe(401);
    step=await post('/email/login',{email:'owner@example.test',password:PASSWORD});
    expect((await post('/email/verify',{...step.body,code:nextCode})).status).toBe(401);
    const now=Date.now()+60000;jest.spyOn(Date,'now').mockReturnValue(now);
    const fresh=authenticator(e.secret).generate({timestamp:now});
    const parallel=await Promise.all([post('/email/verify',{...step.body,code:fresh}),post('/email/verify',{...step.body,code:fresh})]);
    expect(parallel.map(r=>r.status).sort()).toEqual([201,401]);
  });
  it('rejects expired invitations, invalid enrollment proofs and five bad enrollment codes',async()=>{
    const e=await enrollment();
    expect((await post('/invitations/confirm',{challengeId:e.challengeId,proof:'x'.repeat(43),code:'123456'})).status).toBe(401);
    for(let i=0;i<5;i++)expect((await post('/invitations/confirm',{challengeId:e.challengeId,proof:e.proof,code:wrong(e.secret)})).status).toBe(401);
    expect((await post('/invitations/confirm',{challengeId:e.challengeId,proof:e.proof,code:authenticator(e.secret).generate()})).status).toBe(401);
    const token=await invitation('expired@example.test');const id=token.split('.')[0]!;
    await h.db.db.update(authChallenges).set({expiresAt:new Date(0)}).where(eq(authChallenges.id,id));
    expect((await post('/invitations/accept',{token,password:PASSWORD})).status).toBe(401);
  });
  it('does not expose or reassign accounts from another dealership',async()=>{
    const tenantId=newId(),userId=newId();
    const [template]=await h.db.db.select().from(users).limit(1);
    await h.db.db.insert(tenants).values({id:tenantId,code:'other-synthetic',name:'نمایندگی آزمون دیگر',isTest:true});
    await h.db.db.insert(users).values({id:userId,tenantId,username:'foreign-test',email:'foreign@example.test',displayName:'کاربر آزمون دیگر',passwordHash:template.passwordHash,roles:['parts_clerk'],isActive:false,isTest:true});
    const admin=await h.login('admin');
    expect((await admin.post('/auth/invitations',{email:'foreign@example.test',displayName:'new',roles:['system_admin']})).status).toBe(409);
    const list=await admin.get('/auth/invitations');expect(list.body).toEqual([]);
    const [unchanged]=await h.db.db.select().from(users).where(eq(users.id,userId));expect(unchanged.roles).toEqual(['parts_clerk']);
  });
});
