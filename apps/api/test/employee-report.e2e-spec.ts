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

it('scores a technician 0–100 from independently approved jobs only; pauses and self-approvals are not counted as approved', async () => {
  // Synthetic rows in the isolated test database, marked non-test so they follow the production path.
  const { users, tasks, auditEvents, cases, technicianWages } = await import('../src/db/schema');
  const { newId } = await import('../src/common/ids');
  const { eq } = await import('drizzle-orm');
  const expert = await h.login('expert');
  await h.loginAs('perf-tech', ['technician']);
  const db = h.db.db;
  const [tech] = await db.select().from(users).where(eq(users.username, 'perf-tech'));
  const me = (await expert.get('/auth/me')).body as { id: string };
  const kase = (await expert.post('/cases', { admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle: { model: 'تارا' }, coverageType: 'personal', damageDescription: 'آزمون ساختگی امتیاز' })).body as { id: string };
  const dept = ((await expert.get('/departments')).body as { id: string }[])[0]!.id;
  const now = Date.now();
  const at = (minutes: number) => new Date(now + minutes * 60_000);
  const deadline = at(-30);
  const job = (over: Partial<typeof tasks.$inferInsert>) => ({
    id: newId(), tenantId: tech!.tenantId, caseId: kase.id, departmentId: dept, assignedUserId: tech!.id, status: 'approved',
    baselineEndAt: deadline, actualStartAt: at(-120), actualEndAt: at(-60), completedBy: tech!.id, approvedBy: me.id, approvedAt: at(-50), createdBy: me.id, isTest: false, ...over,
  });
  const onTime = Array.from({ length: 5 }, () => job({}));
  const late = job({ actualEndAt: at(-10) });
  const self = job({ approvedBy: tech!.id });
  const paused = job({});
  await db.insert(tasks).values([...onTime, late, self, paused]);
  await db.insert(auditEvents).values({ id: newId(), tenantId: tech!.tenantId, caseId: kase.id, entityType: 'task', entityId: paused.id, action: 'task.paused', actorUserId: tech!.id, isTest: false });
  expect((await db.select().from(cases).where(eq(cases.id, kase.id))).length).toBe(1);
  // Wages recorded on three of the eight approved jobs (the recorded amount is the only revenue source).
  await db.insert(technicianWages).values([onTime[0]!, onTime[1]!, late].map((t, i) => ({ taskId: t.id, tenantId: tech!.tenantId, caseId: kase.id, amountRial: (i + 1) * 1_000_000, setBy: me.id, isTest: false })));

  const admin = await h.login('admin');
  const report = await admin.get('/reports/employees');
  expect(report.status).toBe(200);
  const row = (report.body.employees as { id: string; score: { score: number | null; status: string; breakdown: Record<string, number | null> } | null; eligible: number; reviewed: number; delays: number; holds: number }[]).find((e) => e.id === tech!.id)!;
  // 7 eligible (pause excluded), 6 independently approved (self-approval excluded), 1 late.
  expect(row).toMatchObject({ eligible: 7, reviewed: 6, delays: 1, holds: 1 });
  expect(row.score!.status).toBe('scored');
  // progress 6/7·30 + timeliness 5/6·25 + accuracy 25 + accountability 20 = 91.5 → 92.
  expect(row.score!.breakdown).toEqual({ progress: 25.71, timeliness: 20.83, accuracy: 25, accountability: 20 });
  expect(row.score!.score).toBe(92);
  expect(row.score!.score).toBeGreaterThanOrEqual(0);
  expect(row.score!.score).toBeLessThanOrEqual(100);
  expect((row as unknown as { earnings: unknown }).earnings).toEqual({ source: 'technician_wages', approvedJobs: 8, jobsWithWage: 3, jobsWithoutWage: 5, amountRial: 6_000_000 });
  // A report reader without the wage permission sees the provenance, never the amount.
  const viewer = await h.loginAs('perf-viewer', ['accident_expert'], ['report.manager']);
  const seen = ((await viewer.get('/reports/employees')).body.employees as { id: string; earnings: { amountRial: number | null } | null }[]).find((e) => e.id === tech!.id)!;
  expect(seen.earnings).toMatchObject({ jobsWithWage: 3, amountRial: null });
});
