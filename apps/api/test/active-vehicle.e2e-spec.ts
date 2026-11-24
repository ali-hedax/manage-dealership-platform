import { eq } from 'drizzle-orm';
import { ACTIVE_ACCIDENT_DUPLICATE_MESSAGE } from '@manage/shared';
import { cases } from '../src/db/schema';
import { createHarness, daysAgo, type Client, type Harness } from './harness';

let h: Harness, expert: Client;
const payload = (vin: string) => ({isLegacyEntry:true, admittedAt:daysAgo(1), coverageType:'personal', vehicle:{vin,model:'خودروی ساختگی'}});
beforeAll(async()=>{h=await createHarness();expert=await h.login('expert');});
afterAll(async()=>h?.close());

it('normalizes identity, blocks direct and simultaneous creation and permits own edits',async()=>{
  const vin='TESTVIN0000100001';
  const first=await expert.post('/cases',payload(vin));expect(first.status).toBe(201);
  const check=await expert.post('/cases/active-identity',{identity:'testvin ۰۰۰۰۱۰۰۰۰۱'});
  expect(check.body).toMatchObject({valid:true,exists:true,existingCase:{id:first.body.id}});
  const duplicate=await expert.post('/cases',payload('testvin-0000100001'));
  expect(duplicate.status).toBe(409);expect(duplicate.body.code).toBe('ACTIVE_ACCIDENT_CASE_EXISTS');
  expect(duplicate.body.message).toBe(ACTIVE_ACCIDENT_DUPLICATE_MESSAGE);
  const edited=await expert.patch(`/cases/${first.body.id}`,{expectedVersion:first.body.version,vehicle:{vin}});
  expect(edited.status).toBe(200);
  const results=await Promise.all([expert.post('/cases',payload('TESTVIN0000100002')),expert.post('/cases',payload('TESTVIN0000100002'))]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);
});

it('blocks an identity change to another active vehicle and permits only fully closed prior receptions',async()=>{
  const first=await expert.post('/cases',payload('TESTVIN0000100003'));
  const other=await expert.post('/cases',payload('TESTVIN0000100004'));
  expect(first.status).toBe(201);expect(other.status).toBe(201);
  const edit=await expert.patch(`/cases/${other.body.id}`,{expectedVersion:other.body.version,vehicle:{vin:'TESTVIN0000100003'}});
  expect(edit.body.code).toBe('ACTIVE_ACCIDENT_CASE_EXISTS');
  await h.db.db.update(cases).set({technicalClosedAt:new Date()}).where(eq(cases.id,first.body.id));
  expect((await expert.post('/cases',payload('TESTVIN0000100003'))).status).toBe(409);
  await h.db.db.update(cases).set({status:'closed',stage:'delivered'}).where(eq(cases.id,first.body.id));
  const next=await expert.post('/cases',payload('TESTVIN0000100003'));
  expect(next.status).toBe(201);expect(next.body.vehicle.id).toBe(first.body.vehicle.id);
});

it('handles the verified eight-character ISACO chassis and enforces read permissions on duplicate metadata',async()=>{
  const first=await expert.post('/cases',payload('AB123456'));expect(first.status).toBe(201);
  expect(first.body.vehicle.chassisRef).toBe('AB123456');
  const check=await expert.post('/cases/active-identity',{identity:'ab ۱۲۳۴۵۶'});
  expect(check.body.exists).toBe(true);
  expect((await expert.post('/cases',payload('AB123456'))).status).toBe(409);
  const restricted=await h.loginAs('identity-only',['guest'],['case.create']);
  const hidden=await restricted.post('/cases/active-identity',{identity:'AB123456'});
  expect(hidden.status).toBe(201);expect(hidden.body).toMatchObject({exists:true,existingCase:null});
  expect((await restricted.post('/cases',payload('AB123456'))).body.details.existingCase).toBeNull();
});
