import request from 'supertest';
import { eq } from 'drizzle-orm';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import type { Actor } from '../src/auth/auth.types';
import { alignStationUsernames } from '../src/auth/staff-usernames';
import { users, workshopStations, auditEvents } from '../src/db/schema';
import { createHarness, type Harness, type Client } from './harness';

describe('Staff identifiers and legacy compatibility', () => {
  let h: Harness, admin: Client, actor: Actor;
  const login = (username: string, pin = '4815', devicePassword: string | undefined = 'Device2026test', cookie = '') => request(h.app.getHttpServer()).post('/api/v1/auth/technician-login').set('x-manage-client', 'test').set('Cookie', cookie).send({ username, pin, ...(devicePassword ? { devicePassword } : {}) });
  beforeEach(async () => {
    h = await createHarness();
    await h.db.db.update(users).set({ isActive: false }).where(eq(users.username, 'technician'));
    await h.db.db.update(users).set({ isOwner: true }).where(eq(users.username, 'admin'));
    admin = await h.login('admin');
    actor = { user: (await h.app.get(AuthService).authenticate(admin.cookie.split('=')[1]!))! };
  });
  afterEach(async () => h.close());

  it('creates EXP00, accepts displayed Persian digits, registers a device and keeps the parts role session', async () => {
    const made = await admin.post('/staff/technicians', { displayName: 'قطعات ساختگی', personnelCode: '۰۰', role: 'parts_clerk', pin: '4815', devicePassword: 'Device2026test' });
    expect(made.status).toBe(201);
    expect(made.body).toEqual(expect.arrayContaining([expect.objectContaining({ username: 'exp00' })]));
    expect((await login('EXP ۰۰', '4815', '')).body.code).toBe('DEVICE_NOT_REGISTERED');
    expect((await login('EXP00', '4815', 'WrongPass99')).status).toBe(401);
    const ok = await login('EXP ۰۰');
    expect(ok.status).toBe(200);
    expect(ok.body.roles).toEqual(['parts_clerk']);
    expect(ok.body.permissions).not.toContain('user.manage');
    const cookies = (ok.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; ');
    expect((await request(h.app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookies)).status).toBe(200);
    expect((await login('EXP00', '4815', '', cookies)).status).toBe(200);
    expect((await admin.post('/staff/technicians', { displayName: 'تکراری ساختگی', personnelCode: '00', role: 'parts_clerk', pin: '4815', devicePassword: 'Device2026test' })).status).toBe(409);
  });

  it('aligns swaps atomically by station, preserving IDs, PIN, owner and active sessions', async () => {
    for (const code of ['02', '03']) expect((await admin.post('/staff/technicians', { displayName: `تکنسین ساختگی ${code}`, stationCode: code, trade: 'suspension', pin: '4815', devicePassword: 'Device2026test' })).status).toBe(201);
    const rows = await h.db.db.select().from(users);
    const second = rows.find(u => u.username === 'tech02')!, third = rows.find(u => u.username === 'tech03')!;
    // Old sequential names identify the opposite bay. Keep their IDs/stations.
    await h.db.db.update(users).set({ username: 'temp' }).where(eq(users.id, second.id));
    await h.db.db.update(users).set({ username: 'tech02' }).where(eq(users.id, third.id));
    await h.db.db.update(users).set({ username: 'tech03' }).where(eq(users.id, second.id));
    const oldLogin = await login('tech03');
    const cookie = (oldLogin.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; ');
    const audit = h.app.get(AuditService);
    await expect(alignStationUsernames(h.db, audit, {user:{...actor.user,isOwner:false}})).rejects.toMatchObject({code:'FORBIDDEN'});
    const plan = await alignStationUsernames(h.db, audit, actor);
    expect(plan).toHaveLength(2);
    await expect(alignStationUsernames(h.db, audit, actor, [])).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await alignStationUsernames(h.db, audit, actor, plan);
    const me = await request(h.app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.body.id).toBe(second.id);
    expect(me.body.username).toBe('tech02');
    const after = await h.db.db.select().from(users);
    expect(after.find(u => u.id === second.id)?.pinHash).toBe(second.pinHash);
    expect(after.find(u => u.isOwner)).toEqual(rows.find(u => u.isOwner));
    expect((await login('TECH ۰۳')).body.id).toBe(third.id);
    expect((await h.db.db.select().from(auditEvents)).filter(e => e.action === 'user.username_aligned')).toHaveLength(2);
  });

  it('refuses ambiguous stations and occupied destinations without partial writes', async () => {
    await admin.post('/staff/technicians', { displayName: 'ساختگی', username: 'legacy', pin: '4815', devicePassword: 'Device2026test' });
    const audit = h.app.get(AuditService);
    await expect(alignStationUsernames(h.db, audit, actor)).rejects.toMatchObject({ code: 'AMBIGUOUS_STATION' });
    await h.db.db.update(users).set({ isActive: false }).where(eq(users.username, 'legacy'));
    await admin.post('/staff/technicians', { displayName: 'ساختگی جایگاه', stationCode: '03', trade: 'suspension', pin: '4815', devicePassword: 'Device2026test' });
    const [tech] = await h.db.db.select().from(users).where(eq(users.username, 'tech03'));
    await h.db.db.update(users).set({ username: 'oldtech' }).where(eq(users.id, tech!.id));
    await admin.post('/staff/technicians', { displayName: 'مقصد اشغال', username: 'tech03', role: 'parts_clerk', pin: '4815', devicePassword: 'Device2026test' });
    await expect(alignStationUsernames(h.db, audit, actor)).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
    expect((await h.db.db.select().from(users).where(eq(users.id, tech!.id)))[0]!.username).toBe('oldtech');
    expect((await h.db.db.select().from(workshopStations)).find(s => s.code === '03')!.responsibleUserId).toBe(tech!.id);
  });
});
