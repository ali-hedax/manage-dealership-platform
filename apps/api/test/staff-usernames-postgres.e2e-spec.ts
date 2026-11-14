import { eq } from 'drizzle-orm';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { alignStationUsernames } from '../src/auth/staff-usernames';
import { auditEvents, users } from '../src/db/schema';
import { createHarness, type Harness } from './harness';

const url = process.env.STAFF_PG_TEST_URL;
const suite = url ? describe : describe.skip;
suite('station username swaps on real PostgreSQL connections', () => {
  let h: Harness;
  afterAll(async () => h?.close());
  it('commits one concurrent reviewed swap, rejecting the stale second plan without partial names', async () => {
    h = await createHarness({ config: { DB_DRIVER: 'postgres', DATABASE_URL: url! } });
    await h.db.db.update(users).set({ isActive: false }).where(eq(users.username, 'technician'));
    await h.db.db.update(users).set({ isOwner: true }).where(eq(users.username, 'admin'));
    const admin = await h.login('admin');
    for (const code of ['02', '03']) expect((await admin.post('/staff/technicians', { displayName: `تکنسین ساختگی ${code}`, stationCode: code, trade: 'suspension', pin: '4815', devicePassword: 'Device2026test' })).status).toBe(201);
    const before = await h.db.db.select().from(users);
    const a = before.find(u => u.username === 'tech02')!, b = before.find(u => u.username === 'tech03')!;
    await h.db.db.update(users).set({ username: 'swap-temp' }).where(eq(users.id, a.id));
    await h.db.db.update(users).set({ username: 'tech02' }).where(eq(users.id, b.id));
    await h.db.db.update(users).set({ username: 'tech03' }).where(eq(users.id, a.id));
    const actor = { user: (await h.app.get(AuthService).authenticate(admin.cookie.split('=')[1]!))! };
    const audit = h.app.get(AuditService);
    const plan = await alignStationUsernames(h.db, audit, actor);
    const results = await Promise.allSettled([alignStationUsernames(h.db, audit, actor, plan), alignStationUsernames(h.db, audit, actor, plan)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: 'VERSION_CONFLICT' });
    const after = await h.db.db.select().from(users);
    expect(after.find(u => u.id === a.id)).toMatchObject({ username: 'tech02', pinHash: a.pinHash, devicePasswordHash: a.devicePasswordHash, version: a.version + 1 });
    expect(after.find(u => u.id === b.id)).toMatchObject({ username: 'tech03', pinHash: b.pinHash, version: b.version + 1 });
    expect(after.find(u => u.isOwner)).toEqual(before.find(u => u.isOwner));
    expect(after.some(u => u.username.startsWith('rename-'))).toBe(false);
    expect((await h.db.db.select().from(auditEvents)).filter(e => e.action === 'user.username_aligned')).toHaveLength(2);
  });
});
