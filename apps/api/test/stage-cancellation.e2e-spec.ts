import { and, eq } from 'drizzle-orm';
import type { CaseDetail, Department, Task } from '@manage/shared';
import { auditEvents, cases, partRequests, tasks } from '../src/db/schema';
import { Client, createHarness, daysAgo, type Harness } from './harness';

// «لغو مرحله» (owner, 2026-11-19): a repair stage leaves the active plan without being deleted,
// with reason, user and time; finished work, wages, finance, parts and stock are untouched.
// Synthetic data only.
let h: Harness;
let expert: Client; // task.manage + task.approve (supervisor)
let planner: Client; // task.manage only
let parts: Client;
let tech: Client;
let techId: string;
let depts: Department[];
const dept = (code: string) => depts.find((d) => d.code === code)!.id;

beforeAll(async () => {
  h = await createHarness();
  [expert, parts] = await Promise.all([h.login('expert'), h.login('parts')]);
  planner = await h.loginAs('stage-planner', ['technician'], ['task.manage', 'case.read', 'workshop.read']);
  tech = await h.loginAs('stage-tech', ['technician']);
  techId = (await tech.get('/auth/me')).body.id;
  depts = (await expert.get('/departments')).body;
});
afterAll(async () => h?.close());

async function newCase(): Promise<CaseDetail> {
  const r = await expert.post('/cases', { isLegacyEntry: true, stage: 'assessment', vehicle: { brand: 'ایران خودرو', model: 'رانا پلاس', trim: 'تیپ TU5', plate: '۲۳ ب ۴۵۶ - ۱۶' }, admittedAt: daysAgo(2), coverageType: 'personal' });
  expect(r.status).toBe(201);
  return r.body;
}
async function addTask(caseId: string, body: object): Promise<Task> {
  const r = await expert.post(`/cases/${caseId}/tasks`, body);
  expect(r.status).toBe(201);
  return r.body;
}
const fresh = async (t: Task): Promise<Task> => ((await expert.get(`/cases/${t.caseId}`)).body as CaseDetail).tasks.find((x) => x.id === t.id)!;
const act = (t: Task, action: string) => expert.post(`/tasks/${t.id}/actions`, { action, expectedVersion: t.version });
const auditOf = (taskId: string, action: string) => h.db.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, taskId), eq(auditEvents.action, action)));

describe('cancel and reactivate a repair stage', () => {
  it('removes an unstarted painting stage from the plan, keeps bodywork, frees the next stage and is idempotent', async () => {
    const c = await newCase();
    const body = await addTask(c.id, { departmentId: dept('body'), technicianName: 'الف', weight: 3, assignedUserId: techId });
    const paint = await addTask(c.id, { departmentId: dept('paint'), technicianName: 'ب', weight: 2, dependsOn: [body.id], assignedUserId: techId });
    const qc = await addTask(c.id, { departmentId: dept('electrical'), technicianName: 'ج', weight: 1, dependsOn: [paint.id] });
    expect((await tech.get('/workshop/my-tasks')).body.some((r: { id?: string; task?: { id: string } }) => (r.id ?? r.task?.id) === paint.id)).toBe(true);

    // Unauthorized roles cannot cancel; a reason is required («سایر موارد» needs a note).
    expect((await parts.post(`/tasks/${paint.id}/cancel`, { expectedVersion: paint.version, reason: 'customer_withdrew' })).status).toBe(403);
    expect((await expert.post(`/tasks/${paint.id}/cancel`, { expectedVersion: paint.version, reason: 'other' })).status).toBe(400);

    const r = await planner.post(`/tasks/${paint.id}/cancel`, { expectedVersion: paint.version, reason: 'customer_withdrew', note: 'مشتری از نقاشی انصراف داد' });
    expect(r.status).toBe(201);
    expect(r.body.task).toMatchObject({ status: 'cancelled', cancellation: { reason: 'customer_withdrew', note: 'مشتری از نقاشی انصراف داد', fromStatus: 'pending' } });
    expect(r.body.alreadyCancelled).toBe(false);

    // Repeating changes nothing and records nothing new.
    const again = await planner.post(`/tasks/${paint.id}/cancel`, { expectedVersion: paint.version, reason: 'customer_withdrew' });
    expect(again.body.alreadyCancelled).toBe(true);
    expect(again.body.task.version).toBe(r.body.task.version);
    expect(await auditOf(paint.id, 'task.cancelled')).toHaveLength(1);

    // Active plan and the technician's queue no longer contain it; bodywork is untouched.
    expect((await tech.get('/workshop/my-tasks')).body.some((x: { id?: string; task?: { id: string } }) => (x.id ?? x.task?.id) === paint.id)).toBe(false);
    expect((await fresh(body)).status).toBe('pending');
    const folder = (await expert.get(`/desk/folders/${c.id}`)).body as { tasks: { department: string }[] };
    expect(folder.tasks).toHaveLength(2);
    // Editing a cancelled stage is refused until it is reactivated.
    expect((await expert.patch(`/tasks/${paint.id}`, { expectedVersion: r.body.task.version, technicianName: 'د' })).status).toBe(422);

    // The stage after the cancelled one is no longer held back by it once bodywork is approved.
    let b = (await act(body, 'start')).body as Task;
    b = (await act(b, 'complete')).body as Task;
    b = (await act(b, 'approve')).body as Task;
    expect(b.status).toBe('approved');
    expect((await act(await fresh(qc), 'start')).status).toBe(201);
    // Progress counts only the active stages (3 of 4 weight units approved → 75%).
    expect(((await expert.get(`/cases/${c.id}`)).body as CaseDetail).progressPercent).toBe(75);

    // Reactivation returns it as unstarted, with history kept.
    const back = await planner.post(`/tasks/${paint.id}/reactivate`, { expectedVersion: r.body.task.version, note: 'مشتری دوباره نقاشی خواست' });
    expect(back.status).toBe(201);
    expect(back.body).toMatchObject({ status: 'pending', cancellation: null });
    expect(await auditOf(paint.id, 'task.reactivated')).toHaveLength(1);
    expect(await auditOf(paint.id, 'task.cancelled')).toHaveLength(1);
  });

  it('in progress: supervisor only, with an explicit stop; started time is kept', async () => {
    const c = await newCase();
    const t = await addTask(c.id, { departmentId: dept('paint'), technicianName: 'ب' });
    const started = (await act(t, 'start')).body as Task;
    expect((await planner.post(`/tasks/${t.id}/cancel`, { expectedVersion: started.version, reason: 'plan_changed', confirmStop: true })).status).toBe(403);
    const noConfirm = await expert.post(`/tasks/${t.id}/cancel`, { expectedVersion: started.version, reason: 'plan_changed' });
    expect(noConfirm.status).toBe(422);
    expect(noConfirm.body.code).toBe('STOP_CONFIRM_REQUIRED');
    const ok = await expert.post(`/tasks/${t.id}/cancel`, { expectedVersion: started.version, reason: 'plan_changed', confirmStop: true });
    expect(ok.status).toBe(201);
    expect(ok.body.task).toMatchObject({ status: 'cancelled', cancellation: { fromStatus: 'in_progress' } });
    expect(ok.body.task.actualStartAt).toBe(started.actualStartAt);
    // Reactivating a started stage brings it back in progress (supervisor only).
    expect((await planner.post(`/tasks/${t.id}/reactivate`, { expectedVersion: ok.body.task.version })).status).toBe(403);
    expect((await expert.post(`/tasks/${t.id}/reactivate`, { expectedVersion: ok.body.task.version })).body.status).toBe('in_progress');
  });

  it('completed and financially closed stages are not cancelled; parts and stock are never changed automatically', async () => {
    const c = await newCase();
    const done = await addTask(c.id, { departmentId: dept('body'), technicianName: 'الف' });
    let d = (await act(done, 'start')).body as Task;
    d = (await act(d, 'complete')).body as Task;
    const refused = await expert.post(`/tasks/${done.id}/cancel`, { expectedVersion: d.version, reason: 'customer_withdrew' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('STAGE_COMPLETED');

    const paint = await addTask(c.id, { departmentId: dept('paint'), technicianName: 'ب' });
    const part = await expert.post(`/cases/${c.id}/parts`, { description: 'قطعهٔ مشترک آزمون', partNumber: '00555501', quantity: 1, source: 'company' });
    expect(part.status).toBe(201);
    const before = await h.db.db.select().from(partRequests).where(eq(partRequests.id, part.body.id));
    const r = await expert.post(`/tasks/${paint.id}/cancel`, { expectedVersion: paint.version, reason: 'expert_changed' });
    expect(r.status).toBe(201);
    expect(r.body.partsToReview.map((p: { id: string }) => p.id)).toContain(part.body.id);
    expect(await h.db.db.select().from(partRequests).where(eq(partRequests.id, part.body.id))).toEqual(before);

    const other = await addTask(c.id, { departmentId: dept('electrical'), technicianName: 'ج' });
    await h.db.db.update(cases).set({ financialClosedAt: new Date() }).where(eq(cases.id, c.id));
    const closed = await expert.post(`/tasks/${other.id}/cancel`, { expectedVersion: other.version, reason: 'customer_withdrew' });
    expect(closed.status).toBe(422);
    expect(closed.body.code).toBe('STAGE_INVOICED');
    const [row] = await h.db.db.select().from(tasks).where(eq(tasks.id, other.id));
    expect(row!.status).toBe('pending');
  });
});
