import {Inject,Injectable} from '@nestjs/common';
import {and,asc,eq,sql} from 'drizzle-orm';
import {permissionsFor,ROLES,type Role,type AccessUpdate,type TemplateUpdate,type AccessCatalog} from '@manage/shared';
import {DATABASE,type DatabaseHandle,type Tx} from '../db/database';
import {tenants,users} from '../db/schema';
import {AuditService} from '../audit/audit.service';
import {forbidden,notFound,versionConflict} from '../common/errors';
import type {Actor} from './auth.types';

@Injectable()
export class AccessService {
 constructor(@Inject(DATABASE) private readonly handle:DatabaseHandle,private readonly audit:AuditService){}
 private get db(){return this.handle.db;}
 private async owner(actor:Actor,tx:Tx|typeof this.db=this.db){
  const [u]=await tx.select({isOwner:users.isOwner,isActive:users.isActive}).from(users).where(and(eq(users.id,actor.user.id),eq(users.tenantId,actor.user.tenantId)));
  if(!u?.isOwner||!u.isActive)throw forbidden('تنظیم دسترسی‌ها فقط برای مالک سامانه مجاز است');
 }
 async catalog(actor:Actor):Promise<AccessCatalog>{
  await this.owner(actor);
  const [tenant]=await this.db.select().from(tenants).where(eq(tenants.id,actor.user.tenantId));
  const people=await this.db.select().from(users).where(eq(users.tenantId,actor.user.tenantId)).orderBy(asc(users.displayName));
  return {version:tenant.permissionVersion,templates:tenant.permissionTemplates,staff:people.map(u=>({id:u.id,displayName:u.displayName,email:u.email,roles:u.roles as Role[],isOwner:u.isOwner,isActive:u.isActive,version:u.version,overrides:u.permissionOverrides,permissions:[...permissionsFor(u.roles as Role[],tenant.permissionTemplates,u.permissionOverrides,u.isOwner)]}))};
 }
 async presets(actor:Actor){
  if(!actor.user.permissions.has('user.manage'))throw forbidden();
  const [t]=await this.db.select().from(tenants).where(eq(tenants.id,actor.user.tenantId));
  const [owner]=await this.db.select({id:users.id}).from(users).where(and(eq(users.tenantId,actor.user.tenantId),eq(users.isOwner,true)));
  return {version:t.permissionVersion,templates:t.permissionTemplates,assignableRoles:ROLES.filter(role=>!owner||actor.user.isOwner||[...permissionsFor([role],t.permissionTemplates)].every(p=>actor.user.permissions.has(p)))};
 }
 async updateUser(actor:Actor,id:string,input:AccessUpdate){
  await this.db.transaction(async tx=>{
   // Tenant lock serializes all owner access edits and template changes.
   const [tenant]=await tx.select().from(tenants).where(eq(tenants.id,actor.user.tenantId)).for('update');
   await this.owner(actor,tx);
   if(tenant.permissionVersion!==input.expectedTemplateVersion)throw versionConflict(tenant.permissionVersion);
   const [u]=await tx.select().from(users).where(and(eq(users.id,id),eq(users.tenantId,actor.user.tenantId))).for('update');
   if(!u)throw notFound('کارمند');
   if(u.isOwner)throw forbidden('دسترسی کامل مالک ثابت است؛ مالک از این فرم تغییر نمی‌کند');
   if(u.version!==input.expectedVersion)throw versionConflict(u.version);
   const roles=[...new Set(input.roles)],permissionOverrides={allow:input.allow,deny:input.deny};
   await tx.update(users).set({roles,permissionOverrides,version:u.version+1,updatedAt:new Date()}).where(eq(users.id,id));
   await this.audit.record(tx,actor,{entityType:'user',entityId:id,action:'user.access_updated',before:{roles:u.roles,permissionOverrides:u.permissionOverrides},after:{roles,permissionOverrides},snapshot:{version:u.version+1,row:{id,roles,permissionOverrides}}});
  });return {status:'ok'};
 }
 async updateTemplate(actor:Actor,role:Role,input:TemplateUpdate){
  if(!ROLES.includes(role))throw notFound('سمت');
  await this.db.transaction(async tx=>{
   const [t]=await tx.select().from(tenants).where(eq(tenants.id,actor.user.tenantId)).for('update');
   await this.owner(actor,tx);if(t.permissionVersion!==input.expectedVersion)throw versionConflict(t.permissionVersion);
   const templates={...t.permissionTemplates,[role]:input.permissions};
   await tx.update(tenants).set({permissionTemplates:templates,permissionVersion:sql`${tenants.permissionVersion}+1`}).where(eq(tenants.id,t.id));
   await this.audit.record(tx,actor,{entityType:'user',entityId:actor.user.id,action:'user.role_template_updated',before:{role,permissions:t.permissionTemplates[role]??null},after:{role,permissions:input.permissions},snapshot:{version:t.permissionVersion+1,row:{tenantId:t.id,permissionTemplates:templates}}});
  });return {status:'ok'};
 }
}
