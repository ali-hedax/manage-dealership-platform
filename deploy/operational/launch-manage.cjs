// One-time, owner-approved promotion. Run inside the existing API image.
// Default is a transaction rolled back after all guards and mutations execute.
require('reflect-metadata');
const assert = require('node:assert/strict');
const {createHash}=require('node:crypto');
const {sql}=require('drizzle-orm');
const {permissionsFor}=require('@manage/shared');
const {loadConfig}=require('/app/dist/config');
const {openDatabase}=require('/app/dist/db/database');
const {AuditService}=require('/app/dist/audit/audit.service');
const {CasesService}=require('/app/dist/cases/cases.service');
const {TasksService}=require('/app/dist/tasks/tasks.service');
const {VehicleImportService}=require('/app/dist/vehicle-import/vehicle-import.service');
const mode=process.env.LAUNCH_MODE||'rehearse';
const testDb=process.env.LAUNCH_TEST_DATABASE;
if(testDb){assert.match(testDb,/^launch_verify_\d+$/);const u=new URL(process.env.DATABASE_URL);u.pathname='/'+testDb;process.env.DATABASE_URL=u.toString();}
const cfg=loadConfig({APP_ENV:'production'}), handle=openDatabase(cfg);
const audit=new AuditService(handle,cfg);
const rows=async(tx,q)=>(await tx.execute(q)).rows;
const fingerprint=u=>createHash('sha256').update(JSON.stringify([u.id,u.email,u.password_hash,u.encrypted_totp_secret,u.totp_last_step,u.roles])).digest('hex');
const tables=['part_discrepancies','case_payments','financial_approvals','case_finance','part_requests','assessment_items','assessments','blockers','tasks','qc_inspections','cases','customers','vehicles'];
async function promote(){
 const report={mode,testDatabase:!!testDb};
 const abort=Symbol('rehearsal rollback');
 try{await handle.db.transaction(async tx=>{
  await tx.execute(sql.raw('SET LOCAL lock_timeout = \'10s\''));
  await tx.execute(sql.raw('LOCK TABLE tenants,users,cases,customers,vehicles,tasks,blockers,part_requests,assessments,assessment_items,qc_inspections,case_finance,financial_approvals,case_payments,part_discrepancies,vehicle_imports,vehicle_import_rows IN EXCLUSIVE MODE'));
  const owners=await rows(tx,sql`select * from users where email is not null and is_active and encrypted_totp_secret is not null`);
  assert.equal(owners.length,1,'Exactly one enrolled owner required');const owner=owners[0];assert(owner.roles.includes('system_admin'));
  const [tenant]=await rows(tx,sql`select * from tenants where id=${owner.tenant_id}`);
  assert(tenant.is_test&&tenant.code==='demo','Expected unpromoted demo tenant');
  const actor={requestId:'owner-authorized-real-start-20261102',user:{id:owner.id,tenantId:tenant.id,tenantCode:tenant.code,tenantName:tenant.name,isTestTenant:false,username:owner.username,displayName:owner.display_name,roles:owner.roles,permissions:permissionsFor(owner.roles),sessionId:'administrative-maintenance'}};
  const cases=await rows(tx,sql`select c.id,c.case_number,c.version,c.is_test,c.origin,v.vin,u.phone from cases c join vehicles v on v.id=c.vehicle_id left join customers u on u.id=c.customer_id where c.tenant_id=${tenant.id} order by c.case_number`);
  assert.deepEqual(cases.map(c=>c.case_number),Array.from({length:5},(_,i)=>`AC-1405-000${i+1}`));
  for(const c of cases){assert(c.is_test&&c.origin==='manual');assert(c.vin===null||c.vin.startsWith('TESTVIN'));assert(c.phone===null||c.phone.startsWith('0900'));}
  const demos=await rows(tx,sql`select id,username,email,encrypted_totp_secret,version from users where tenant_id=${tenant.id} and id<>${owner.id} order by username`);
  assert.deepEqual(demos.map(u=>u.username),['admin','cashier','expert','manager','parts','qc','supervisor']);
  assert(demos.every(u=>!u.email&&!u.encrypted_totp_secret));
  report.removeCases=cases.map(c=>c.case_number);report.deactivateDemoAccounts=demos.length;report.deleted={};
  const beforeAudit=(await rows(tx,sql`select count(*)::int n from audit_events where tenant_id=${tenant.id}`))[0].n;
  const beforeCounter=JSON.stringify(await rows(tx,sql`select * from case_counters where tenant_id=${tenant.id} order by year`));
  for(const table of tables){const [n]=await rows(tx,sql`select count(*)::int n,count(*) filter(where not is_test)::int real from ${sql.identifier(table)} where tenant_id=${tenant.id}`);assert.equal(n.real,0,`Real rows found in ${table}`);report.deleted[table]=n.n;}
  assert.equal(report.deleted.customers,5);assert.equal(report.deleted.vehicles,5);
  const [refs]=await rows(tx,sql`select count(*)::int n from vehicle_import_rows where tenant_id=${tenant.id} and case_id is not null`);assert.equal(refs.n,0,'Existing import results refer to cases');
  await tx.execute(sql`update blockers set part_request_id=null where tenant_id=${tenant.id}`);
  await tx.execute(sql`delete from task_dependencies where task_id in(select id from tasks where tenant_id=${tenant.id}) or depends_on_task_id in(select id from tasks where tenant_id=${tenant.id})`);
  for(const table of tables){await tx.execute(sql`delete from ${sql.identifier(table)} where tenant_id=${tenant.id}`);}
  for(const c of cases)await audit.record(tx,actor,{entityType:'case',entityId:c.id,caseId:c.id,action:'case.synthetic_removed_for_launch',reason:'Owner requested real operational start; verified synthetic only; restorable backup retained',before:{caseNumber:c.case_number},after:{removed:true},snapshot:{version:c.version+1,row:{id:c.id,removed:true,synthetic:true}}});
  for(const u of demos){await tx.execute(sql`update users set is_active=false,version=version+1,updated_at=now() where id=${u.id} and tenant_id=${tenant.id}`);await tx.execute(sql`update sessions set revoked_at=coalesce(revoked_at,now()) where user_id=${u.id} and tenant_id=${tenant.id}`);await audit.record(tx,actor,{entityType:'user',entityId:u.id,action:'user.demo_disabled_for_launch',after:{isActive:false},snapshot:{version:u.version+1,row:{id:u.id,isActive:false}}});}
  await tx.execute(sql`update tenants set name='نمایندگی ایران‌خودرو ۱۳۰۷ حسینی',code='ikco-1307',is_test=false where id=${tenant.id}`);
  await tx.execute(sql`update users set is_test=false,version=version+1,updated_at=now() where id=${owner.id}`);
  // These rows are actual-sheet previews, not demo data; preserve their complete sources.
  await tx.execute(sql`update vehicle_imports set is_test=false where tenant_id=${tenant.id}`);
  await tx.execute(sql`update vehicle_import_rows set is_test=false where tenant_id=${tenant.id}`);
  await audit.record(tx,actor,{entityType:'user',entityId:owner.id,action:'tenant.real_use_started',before:{name:tenant.name,isTest:true},after:{name:'نمایندگی ایران‌خودرو ۱۳۰۷ حسینی',isTest:false,deleted:report.deleted},snapshot:{version:owner.version+1,row:{id:owner.id,isTest:false}}});
  const [after]=await rows(tx,sql`select * from users where id=${owner.id}`);assert.equal(fingerprint(after),fingerprint(owner),'Owner credentials or roles changed');assert(after.is_active&&!after.is_test);
  assert.equal(JSON.stringify(await rows(tx,sql`select * from case_counters where tenant_id=${tenant.id} order by year`)),beforeCounter);
  const [ae]=await rows(tx,sql`select count(*)::int n from audit_events where tenant_id=${tenant.id}`);assert.equal(ae.n,beforeAudit+13);
  report.ownerCredentialsPreserved=true;report.auditPreserved=true;report.counterPreserved=true;
  if(mode==='rehearse')throw abort;
  assert(mode==='promote'&&process.env.LAUNCH_APPROVED==='remove-exactly-five-synthetic-cases');
 });}catch(e){if(e!==abort)throw e;}
 console.log(JSON.stringify(report));
}
async function importReady(){
 const [owner]=await rows(handle.db,sql`select u.*,t.code,t.name,t.is_test as tenant_test from users u join tenants t on t.id=u.tenant_id where u.email is not null and u.is_active and u.encrypted_totp_secret is not null`);assert(owner&&!owner.tenant_test);
 const actor={requestId:'owner-authorized-initial-import-20261102',user:{id:owner.id,tenantId:owner.tenant_id,tenantCode:owner.code,tenantName:owner.name,isTestTenant:false,username:owner.username,displayName:owner.display_name,roles:owner.roles,permissions:permissionsFor(owner.roles),sessionId:'administrative-maintenance'}};
 const caseService=new CasesService(handle,audit),taskService=new TasksService(handle,audit,caseService),imports=new VehicleImportService(handle,audit,caseService,taskService);
 const previews=await rows(handle.db,sql`select id,counts from vehicle_imports where tenant_id=${owner.tenant_id} and status='preview' and decisions->>'dateWithoutTime'='true' order by created_at desc limit 1`);assert.equal(previews.length,1);assert.equal(previews[0].counts.new,15,'Unexpected preview count; review fresh file first');
 const result=await imports.apply(actor,previews[0].id);
 assert.equal(result.counts.new,15,'Import must successfully create all 15 ready cases');
 let repeated=false;try{await imports.apply(actor,result.id);}catch(e){repeated=e.code==='IMPORT_NOT_PREVIEW'||e.response?.code==='IMPORT_NOT_PREVIEW'||e.message.includes('قبلاً');}assert(repeated,'Reapplying an applied preview must be refused');
 const [n]=await rows(handle.db,sql`select count(*)::int n,count(*) filter(where is_test)::int test,count(distinct import_key)::int unique_keys from cases where tenant_id=${owner.tenant_id}`);assert.equal(n.n,15);assert.equal(n.test,0);assert.equal(n.unique_keys,15);
 const fs=require('node:fs');fs.writeFileSync('/tmp/manage-launch-import.xlsx',Buffer.from((await imports.report(actor,result.id)).data),{mode:0o600});
 console.log(JSON.stringify({mode,importId:result.id,status:result.status,counts:result.counts,cases:n,rows:result.rows.map(r=>({row:r.rowNo,outcome:r.outcome,caseNumber:r.caseNumber}))}));
}
(async()=>{try{if(mode==='import')await importReady();else await promote();}finally{await handle.close();}})().catch(e=>{console.error('Launch aborted:',e.message);process.exit(1)});
