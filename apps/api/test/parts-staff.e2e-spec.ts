import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import { auditEvents, users } from '../src/db/schema';
import { createHarness, daysAgo, type Client, type Harness } from './harness';

// Owner, 2026-11-19: at least five independent parts-supply staff (no fixed limit), each with
// a unique username, a four-digit PIN, the parts permissions and an own action history; the
// owner can deactivate and reactivate them. PINs are never returned or stored in plain text.
let h: Harness;
let admin: Client;
let expert: Client;
beforeAll(async () => {
  h = await createHarness();
  [admin, expert] = await Promise.all([h.login('admin'), h.login('expert')]);
});
afterAll(async () => h?.close());

const pinLogin = (username: string, pin: string) =>
  request(h.app.getHttpServer()).post('/api/v1/auth/technician-login').set('x-manage-client', 'test').send({ username, pin });
const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
const as = (cookie: string) => ({
  get: (path: string) => request(h.app.getHttpServer()).get('/api/v1' + path).set('Cookie', cookie).set('x-manage-client', 'test'),
  post: (path: string, body: object) => request(h.app.getHttpServer()).post('/api/v1' + path).set('Cookie', cookie).set('x-manage-client', 'test').send(body),
});

it('six parts-supply staff sign in with their own PIN, act independently and are recorded per person', async () => {
  const names = ['store1', 'store2', 'store3', 'store4', 'store5', 'store6'];
  for (const [i, username] of names.entries()) {
    const r = await admin.post('/staff/technicians', { displayName: `مسئول قطعات آزمون ${i + 1}`, username, pin: `25${i}${i}`, role: 'parts_clerk' });
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.body)).not.toContain(`25${i}${i}`);
  }
  const rows = await h.db.db.select().from(users).where(inArray(users.username, names));
  expect(rows).toHaveLength(6);
  expect(rows.every((u) => u.roles.includes('parts_clerk') && !!u.pinHash && u.pinHash.startsWith('scrypt$'))).toBe(true);

  const kase = await expert.post('/cases', { isLegacyEntry: true, vehicle: { model: 'دنا' }, admittedAt: daysAgo(1), coverageType: 'personal' });
  const sessions: string[] = [];
  for (const [i, username] of names.entries()) {
    const login = await pinLogin(username, `25${i}${i}`);
    expect(login.status).toBe(200);
    sessions.push(cookieOf(login));
  }
  // Each one works on the shared parts list (special-aid order of a different line); the audit names who did what.
  for (const [i, cookie] of sessions.slice(0, 5).entries()) {
    const part = await expert.post(`/cases/${kase.body.id}/parts`, { description: `قطعهٔ آزمون ${i + 1}`, partNumber: `0055560${i}`, quantity: 1, source: 'company' });
    expect(part.status).toBe(201);
    const step = await as(cookie).post(`/parts/${part.body.id}/flow`, { expectedVersion: part.body.version, action: 'emdad', emdadNo: `880000${i}` });
    expect(step.status).toBe(201);
  }
  const acted = await h.db.db.select().from(auditEvents).where(and(eq(auditEvents.caseId, kase.body.id), inArray(auditEvents.actorUserId, rows.map((u) => u.id))));
  expect(new Set(acted.map((a) => a.actorUserId)).size).toBe(5);

  // Deactivate one: the PIN no longer works; the others are unaffected; reactivation restores it.
  const store6 = rows.find((u) => u.username === 'store6')!;
  expect((await admin.put(`/staff/technicians/${store6.id}/active`, { active: false, reason: 'آزمون غیرفعال‌سازی' })).status).toBeLessThan(300);
  expect((await pinLogin('store6', '2555')).status).toBe(401);
  expect((await pinLogin('store1', '2500')).status).toBe(200);
  expect((await admin.put(`/staff/technicians/${store6.id}/active`, { active: true, reason: 'آزمون فعال‌سازی' })).status).toBeLessThan(300);
  expect((await pinLogin('store6', '2555')).status).toBe(200);
});
