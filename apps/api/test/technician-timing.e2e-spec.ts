import { eq } from 'drizzle-orm';
import type { Assessment, CaseDetail, CaseWorkflow, Task, WorkshopTask } from '@manage/shared';
import { auditEvents, tasks, users } from '../src/db/schema';
import { newId } from '../src/common/ids';
import { createHarness, daysAgo, type Client, type Harness } from './harness';

// Technician duration and delay per assignment, parallel assignments on one
// vehicle, and Persian guidance when «شروع کار» is blocked (owner, 2026-11-17).
// Synthetic data only.
let h: Harness, expert: Client, admin: Client, paintTech: Client, mechTech: Client;
let paintId: string, mechId: string, paintDept: string, mechDept: string, paintStation: string, mechStation: string;

beforeAll(async () => {
  h = await createHarness();
  [expert, admin] = await Promise.all([h.login('expert'), h.login('admin')]);
  paintTech = await h.loginAs('timing-paint', ['technician']);
  mechTech = await h.loginAs('timing-mech', ['technician']);
  const byName = async (u: string) => (await h.db.db.select().from(users).where(eq(users.username, u)))[0]!.id;
  [paintId, mechId] = [await byName('timing-paint'), await byName('timing-mech')];
  const departments = (await expert.get('/departments')).body as { id: string; code: string }[];
  paintDept = departments.find((d) => d.code === 'paint')!.id;
  mechDept = departments.find((d) => d.code === 'mechanical')!.id;
  paintStation = (await admin.post('/workshop/stations', { code: 'TIME-P1', name: 'نقاشی ساختگی', trade: 'paint', departmentId: paintDept, responsibleUserId: null })).body.find((s: { code: string }) => s.code === 'TIME-P1').id;
  mechStation = (await admin.post('/workshop/stations', { code: 'TIME-M1', name: 'مکانیک ساختگی', trade: 'mechanical', departmentId: mechDept, responsibleUserId: null })).body.find((s: { code: string }) => s.code === 'TIME-M1').id;
});
afterAll(async () => h?.close());

const getCase = async (id: string): Promise<CaseDetail> => (await expert.get(`/cases/${id}`)).body;
const workflow = async (id: string): Promise<CaseWorkflow> => (await expert.get(`/cases/${id}/workflow`)).body;
const mine = async (c: Client): Promise<WorkshopTask[]> => (await c.get('/workshop/my-tasks')).body;

/** A guided case admitted days ago with a final assessment (the clock must not start at admission). */
async function guidedCase(vin: string): Promise<CaseDetail> {
  const c: CaseDetail = (await expert.post('/cases', { customer: { fullName: 'مشتری آزمون زمان', phone: '09000000456' }, vehicle: { model: 'تارا', vin }, coverageType: 'personal', admittedAt: daysAgo(3), damageDescription: 'نقاشی؛ ساختگی' })).body;
  let a: Assessment = (await expert.post(`/cases/${c.id}/assessments`, { kind: 'initial', assessorName: 'کارشناس ساختگی' })).body;
  a = (await expert.post(`/assessments/${a.id}/items`, { expectedVersion: a.version, action: 'repair', description: 'اجرت نقاشی', labourDepartmentId: paintDept, labourRial: 1000000 })).body;
  a = (await expert.post(`/assessments/${a.id}/finalize`, { expectedVersion: a.version })).body;
  await expert.post(`/assessments/${a.id}/authorization`, { expectedVersion: a.version, decision: 'approved', source: 'customer', method: 'in_person' });
  return getCase(c.id);
}
const confirmPlan = async (id: string) => {
  const c = await getCase(id);
  return expert.post(`/cases/${id}/workflow`, { action: 'confirm_plan', expectedVersion: c.version });
};

it('explains a missing repair route to authorized and unauthorized roles, and the original start succeeds after the fix', async () => {
  const c = await guidedCase('TESTVIN9000000101');
  // No route at all: the step to execution names the missing route and who can set it.
  const refused = await confirmPlan(c.id);
  expect(refused.body.code).toBe('REPAIR_PLAN_INCOMPLETE');
  expect(refused.body.details.blockers.map((b: { code: string }) => b.code)).toEqual(['REPAIR_ROUTE_MISSING']);
  expect(refused.body.details.blockers[0]).toMatchObject({ message: 'برای شروع کار، مسیر تعمیر این خودرو باید مشخص شود.', actionLabel: 'تنظیم مسیر تعمیر', permissions: ['task.manage'], target: { caseId: c.id, tab: 'plan', anchor: 'case-plan' } });
  expect((await workflow(c.id)).blockers!.execution.map((b) => b.code)).toEqual(['REPAIR_ROUTE_MISSING']);

  // A job card for the technician without station or duration: the route is still not configured.
  const created = await expert.post(`/cases/${c.id}/tasks`, { departmentId: paintDept, assignedUserId: paintId, title: 'نقاشی بدون مسیر' });
  expect(created.status).toBe(201);
  const card = (await mine(paintTech)).find((t) => t.id === created.body.id)!;
  expect(card).toMatchObject({ canStart: false, workMinutes: null, delayDays: null, startSource: null });
  expect(card.startBlockers!.map((b) => b.code)).toEqual(['REPAIR_ROUTE_INCOMPLETE']);
  expect(card.startBlockers![0]!.message).toContain('برای شروع کار، مسیر تعمیر این خودرو باید مشخص شود');
  // Unauthorized (technician) and authorized (expert) get the same stable code; only the expert may resolve it.
  const asTech = await paintTech.post(`/workshop/my-tasks/${created.body.id}/actions`, { action: 'start', expectedVersion: created.body.version });
  expect(asTech.status).toBe(422);
  expect(asTech.body).toMatchObject({ code: 'PLAN_CONFIRM_REQUIRED', details: { blockers: [{ code: 'REPAIR_ROUTE_INCOMPLETE', role: expect.stringContaining('کارشناس تصادفات') }] } });
  const asExpert = await expert.post(`/tasks/${created.body.id}/actions`, { action: 'start', expectedVersion: created.body.version });
  expect(asExpert.body.details.blockers[0].code).toBe('REPAIR_ROUTE_INCOMPLETE');

  // The expert sets the route; the plan is still unconfirmed, which is the next explained step.
  const fixed = await expert.patch(`/tasks/${created.body.id}`, { expectedVersion: created.body.version, stationId: paintStation, durationDays: 1, scheduleReason: 'تنظیم مسیر ساختگی' });
  expect(fixed.status).toBe(200);
  expect((await mine(paintTech)).find((t) => t.id === created.body.id)!.startBlockers!.map((b) => b.code)).toEqual(['REPAIR_PLAN_NOT_CONFIRMED']);
  expect((await confirmPlan(c.id)).status).toBe(201);
  const fresh = (await mine(paintTech)).find((t) => t.id === created.body.id)!;
  expect(fresh).toMatchObject({ canStart: true, startBlockers: [] });
  const retried = await paintTech.post(`/workshop/my-tasks/${created.body.id}/actions`, { action: 'start', expectedVersion: fresh.version });
  expect(retried.status).toBe(201);
});

it('starts the technician clock at the actual start only, keeps it uncalculated without one, and counts a fraction of a day as zero', async () => {
  const c = await guidedCase('TESTVIN9000000102');
  const planned = await expert.post(`/cases/${c.id}/repair-plan/steps`, { steps: [{ title: 'نقاشی', departmentId: paintDept, stationId: paintStation, assignedUserId: paintId, days: 1 }] });
  expect(planned.status).toBe(201);
  expect((await confirmPlan(c.id)).status).toBe(201);
  let card = (await mine(paintTech)).find((t) => t.caseId === c.id)!;
  // Admitted three days ago, not started: nothing is calculated.
  expect(card).toMatchObject({ status: 'pending', actualStartAt: null, workMinutes: null, lateMinutes: null, workDays: null, delayDays: null, startSource: null });
  expect((await paintTech.post(`/workshop/my-tasks/${card.id}/actions`, { action: 'start', expectedVersion: card.version })).status).toBe(201);
  card = (await mine(paintTech)).find((t) => t.caseId === c.id)!;
  expect(card).toMatchObject({ status: 'in_progress', startSource: 'recorded', workDays: 0, delayDays: 0 });
  expect(card.workMinutes!).toBeLessThan(card.dayMinutes!);

  // A legacy assignment: active without actual_start_at. Without a start event it stays «not recorded»; with one it is used.
  const [source] = await h.db.db.select().from(tasks).where(eq(tasks.id, card.id));
  const legacyId = newId();
  await h.db.db.insert(tasks).values({ ...source!, id: legacyId, title: 'کار قدیمی بدون زمان شروع', status: 'in_progress', actualStartAt: null, importRef: null, version: 1 });
  expect((await mine(paintTech)).find((t) => t.id === legacyId)).toMatchObject({ startSource: null, actualStartAt: null, workMinutes: null, delayDays: null });
  await h.db.db.insert(auditEvents).values({ id: newId(), tenantId: source!.tenantId, caseId: c.id, entityType: 'task', entityId: legacyId, action: 'task.started', occurredAt: new Date(Date.now() - 60_000), isTest: true });
  expect((await mine(paintTech)).find((t) => t.id === legacyId)).toMatchObject({ startSource: 'event', workDays: 0, delayDays: 0 });
});

it('runs two assignments of different technicians and workshops independently; finishing one never completes the case', async () => {
  const c = await guidedCase('TESTVIN9000000103');
  const planned = await expert.post(`/cases/${c.id}/repair-plan/steps`, { steps: [
    { title: 'نقاشی', departmentId: paintDept, stationId: paintStation, assignedUserId: paintId, days: 2 },
    { title: 'مکانیک', departmentId: mechDept, stationId: mechStation, assignedUserId: mechId, days: 1, concurrentWithPrevious: true },
  ] });
  expect(planned.status).toBe(201);
  expect((await confirmPlan(c.id)).status).toBe(201);
  const [paint, mech] = planned.body as Task[];
  expect((await paintTech.post(`/workshop/my-tasks/${paint!.id}/actions`, { action: 'start', expectedVersion: paint!.version })).status).toBe(201);
  // While paint work is active, the mechanic starts his own eligible assignment.
  const mechCard = (await mine(mechTech)).find((t) => t.id === mech!.id)!;
  expect(mechCard).toMatchObject({ canStart: true, startBlockers: [] });
  expect((await mechTech.post(`/workshop/my-tasks/${mech!.id}/actions`, { action: 'start', expectedVersion: mechCard.version })).status).toBe(201);

  const paintStart = (await mine(paintTech)).find((t) => t.id === paint!.id)!.actualStartAt;
  const mechActive = (await mine(mechTech)).find((t) => t.id === mech!.id)!;
  expect((await mechTech.post(`/workshop/my-tasks/${mech!.id}/actions`, { action: 'complete', expectedVersion: mechActive.version })).status).toBe(201);
  const paintNow = (await mine(paintTech)).find((t) => t.id === paint!.id)!;
  expect(paintNow).toMatchObject({ status: 'in_progress', actualStartAt: paintStart, actualEndAt: null });
  expect((await mine(mechTech)).find((t) => t.id === mech!.id)).toMatchObject({ status: 'done' });
  expect((await workflow(c.id)).current).toBe('execution');
  expect((await getCase(c.id)).stage).toBe('in_repair');

  // A step added while paint is active can run alongside it once the plan is confirmed again.
  const added = await expert.post(`/cases/${c.id}/repair-plan/steps`, { afterTaskIds: [], steps: [{ title: 'مکانیک دوم', departmentId: mechDept, stationId: mechStation, assignedUserId: mechId, days: 1 }] });
  expect(added.status).toBe(201);
  const extra = (added.body as Task[])[0]!;
  expect((await mine(mechTech)).find((t) => t.id === extra.id)!.startBlockers!.map((b) => b.code)).toEqual(['TASK_NOT_IN_PLAN']);
  expect((await confirmPlan(c.id)).status).toBe(201);
  const ready = (await mine(mechTech)).find((t) => t.id === extra.id)!;
  expect((await mechTech.post(`/workshop/my-tasks/${extra.id}/actions`, { action: 'start', expectedVersion: ready.version })).status).toBe(201);
  expect((await mine(paintTech)).find((t) => t.id === paint!.id)).toMatchObject({ status: 'in_progress', actualStartAt: paintStart });
});

it('allows the same technician to start multiple assigned vehicles without completing earlier jobs', async () => {
  const first = await guidedCase('TESTVIN9000000201');
  const second = await guidedCase('TESTVIN9000000202');
  const third = await guidedCase('TESTVIN9000000203');

  const ids: string[] = [];
  for (const kase of [first, second, third]) {
    const planned = await expert.post(`/cases/${kase.id}/repair-plan/steps`, {
      steps: [{ title: 'نقاشی چند خودرو', departmentId: paintDept, stationId: paintStation, assignedUserId: paintId, days: 1 }],
    });
    expect(planned.status).toBe(201);
    expect((await confirmPlan(kase.id)).status).toBe(201);
    ids.push((planned.body as Task[])[0]!.id);
  }

  const starts = new Map<string, string | null>();
  for (const id of ids) {
    const job = (await mine(paintTech)).find(t => t.id === id)!;
    expect(job).toMatchObject({ status: 'pending', canStart: true, startBlockers: [] });
    expect((await paintTech.post(`/workshop/my-tasks/${id}/actions`, {
      action: 'start', expectedVersion: job.version,
    })).status).toBe(201);
    starts.set(id, (await mine(paintTech)).find(t => t.id === id)!.actualStartAt);
  }

  const active = (await mine(paintTech)).filter(t => ids.includes(t.id));
  expect(active).toHaveLength(3);
  expect(active.every(t => t.status === 'in_progress' && !!t.actualStartAt)).toBe(true);

  const other = active.find(t => t.id === ids[1])!;
  const route = `/workshop/my-tasks/${other.id}/actions`;
  expect((await paintTech.post(route,{action:'pause',expectedVersion:other.version,note:'انتظار قطعه'})).status).toBe(201);
  const paused = (await mine(paintTech)).find(t=>t.id===other.id)!;
  expect(paused.pauseReason).toBe('انتظار قطعه');
  expect((await paintTech.post(route,{action:'complete',expectedVersion:paused.version})).status).toBe(422);
  expect((await paintTech.post(route,{action:'resume',expectedVersion:paused.version,note:'قطعه رسید'})).status).toBe(201);
  expect((await mine(paintTech)).find(t=>t.id===other.id)!.pauseReason).toBeNull();
  const firstNow = active.find(t => t.id === ids[0])!;
  expect((await paintTech.post(`/workshop/my-tasks/${firstNow.id}/actions`, {
    action: 'complete', expectedVersion: firstNow.version,
  })).status).toBe(201);

  const afterwards = (await mine(paintTech)).filter(t => ids.includes(t.id));
  expect(afterwards.find(t => t.id === ids[0])!.status).toBe('done');
  for (const id of ids.slice(1)) {
    expect(afterwards.find(t => t.id === id)).toMatchObject({
      status: 'in_progress', actualStartAt: starts.get(id), actualEndAt: null,
    });
  }
});
