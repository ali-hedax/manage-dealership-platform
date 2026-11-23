import {createHarness, type Harness} from './harness';

let h:Harness;
beforeAll(async()=>{h=await createHarness();});
afterAll(async()=>{await h?.close();});

it('restricts the named employee roster and withholds scores from synthetic activity',async()=>{
  const clerk=await h.login('parts');
  expect((await clerk.get('/reports/employees')).status).toBe(403);
  const admin=await h.login('admin');
  const report=await admin.get('/reports/employees');
  expect(report.status).toBe(200);
  const staff=report.body.employees as {id:string;name:string;score:{score:number|null}|null}[];
  expect(staff.length).toBeGreaterThan(0);
  expect(new Set(staff.map(s=>s.id)).size).toBe(staff.length);
  expect(staff.every(s=>s.name && s.score?.score==null)).toBe(true);
});
