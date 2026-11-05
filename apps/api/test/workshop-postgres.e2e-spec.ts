import { DEFAULT_WORK_CALENDAR } from '@manage/shared';
import { createHarness, type Client, type Harness } from './harness';
const url=process.env.WORKSHOP_PG_TEST_URL;
const suite=url?describe:describe.skip;
suite('repair workflow on real PostgreSQL connections',()=>{
 let h:Harness,c:Client,p:Client,a:Client,t:Client,caseId:string,departmentId:string,techId:string;
 beforeAll(async()=>{
  h=await createHarness({config:{DB_DRIVER:'postgres',DATABASE_URL:url!}});
  c=await h.login('expert');p=await h.login('parts');a=await h.login('admin');t=await h.loginAs('concurrent-technician',['technician']);
  techId=(await t.get('/auth/me')).body.id;departmentId=(await c.get('/departments')).body[0].id;
  const r=await c.post('/cases',{admittedAt:new Date().toISOString(),coverageType:'golden_card',vehicle:{model:'خودرو هم‌زمانی آزمون',vin:'TESTVIN000PG00001'}});expect(r.status).toBe(201);caseId=r.body.id;
 });
 afterAll(async()=>{await h?.close();});
 it('serializes competing calendar revisions with the same expected version',async()=>{
  const body={expectedVersion:0,effectiveFrom:new Date(Date.now()+210*60000).toISOString().slice(0,10),calendar:DEFAULT_WORK_CALENDAR,reason:'تقویم آزمون هم‌زمانی'};
  const rs=await Promise.all([a.post('/workshop/calendar',body),a.post('/workshop/calendar',body)]);
  expect(rs.map(r=>r.status).sort()).toEqual([201,409]);
 });
 it('prevents a dependency cycle across simultaneous edits of different tasks',async()=>{
  const x=(await c.post(`/cases/${caseId}/tasks`,{departmentId,title:'مرحله الف'})).body;
  const y=(await c.post(`/cases/${caseId}/tasks`,{departmentId,title:'مرحله ب'})).body;
  const rs=await Promise.all([c.patch(`/tasks/${x.id}`,{expectedVersion:1,dependsOn:[y.id],scheduleReason:'ویرایش هم‌زمان مسیر'}),c.patch(`/tasks/${y.id}`,{expectedVersion:1,dependsOn:[x.id],scheduleReason:'ویرایش هم‌زمان مسیر'})]);
  expect(rs.map(r=>r.status).sort()).toEqual([200,422]);expect(rs.find(r=>r.status===422)?.body.code).toBe('DEPENDENCY_CYCLE');
 });
 it('accepts only one competing quote for the same part version',async()=>{
  const need=await c.post(`/cases/${caseId}/parts`,{description:'نیاز آزمون هم‌زمانی',source:'external'});expect(need.status).toBe(201);
  const body={expectedVersion:1,unitPriceRial:1000,supplier:'فروشنده آزمون',validUntil:new Date(Date.now()+86400000).toISOString()};
  const rs=await Promise.all([p.post(`/workshop/parts/${need.body.id}/quotes`,body),p.post(`/workshop/parts/${need.body.id}/quotes`,body)]);
  expect(rs.map(r=>r.status).sort()).toEqual([201,409]);
 });
 it('records one start when the assigned technician submits twice',async()=>{
  const r=await c.post(`/cases/${caseId}/tasks`,{departmentId,assignedUserId:techId,title:'شروع هم‌زمان آزمون'});expect(r.status).toBe(201);
  const body={action:'start',expectedVersion:1};const rs=await Promise.all([t.post(`/workshop/my-tasks/${r.body.id}/actions`,body),t.post(`/workshop/my-tasks/${r.body.id}/actions`,body)]);
  expect(rs.map(r=>r.status).sort()).toEqual([201,409]);
 });
});
