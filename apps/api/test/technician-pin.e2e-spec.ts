import request from 'supertest';
import { eq } from 'drizzle-orm';
import { auditEvents, sessions, users } from '../src/db/schema';
import { createHarness, type Client, type Harness } from './harness';

const KEY = 'synthetic-test-authenticator-key-32-characters';

describe('Technician sign-in with username + 4-digit PIN', () => {
  let h: Harness, admin: Client;
  const pinLogin = (username: string, pin: string) =>
    request(h.app.getHttpServer()).post('/api/v1/auth/technician-login').set('x-manage-client', 'test').send({ username, pin });
  const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

  afterEach(async () => {
    await h.close();
  });

  describe('in the default sign-in mode', () => {
    beforeEach(async () => {
      h = await createHarness();
      admin = await h.login('admin');
    });

    it('lets user.manage create a technician who signs in with the PIN and sees only own tasks', async () => {
      const created = await admin.post('/staff/technicians', { displayName: 'صافکار آزمون', username: 'Safkar2', pin: '۱۲۳۴' });
      expect(created.status).toBe(201);
      expect(created.body).toEqual(expect.arrayContaining([expect.objectContaining({ username: 'safkar2', displayName: 'صافکار آزمون', hasPin: true, isActive: true })]));
      const [row] = await h.db.db.select().from(users).where(eq(users.username, 'safkar2'));
      expect(row!.roles).toEqual(['technician']);
      expect(row!.pinHash).toMatch(/^scrypt\$/);
      expect(row!.email).toBeNull();

      const ok = await pinLogin('safkar2', '1234');
      expect(ok.status).toBe(200);
      expect(ok.body.authentication).toBe('pin');
      expect(ok.body.permissions).toEqual(['task.execute']);
      const tech = await request(h.app.getHttpServer()).get('/api/v1/workshop/my-tasks').set('Cookie', cookieOf(ok)).set('x-manage-client', 'test');
      expect(tech.status).toBe(200);
      const cases = await request(h.app.getHttpServer()).get('/api/v1/cases').set('Cookie', cookieOf(ok)).set('x-manage-client', 'test');
      expect(cases.status).toBe(403);
      const audit = await h.db.db.select().from(auditEvents).where(eq(auditEvents.entityId, row!.id));
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['user.technician_created', 'auth.pin_login']));
    });

    it('rejects wrong PINs, locks after five with 423, and refuses PIN sign-in for other roles', async () => {
      await admin.post('/staff/technicians', { displayName: 'نقاش آزمون', username: 'naghash1', pin: '4321' });
      for (let i = 0; i < 4; i++) expect((await pinLogin('naghash1', '0000')).status).toBe(401);
      const locked = await pinLogin('naghash1', '0000');
      expect(locked.status).toBe(423);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
      expect((await pinLogin('naghash1', '4321')).status).toBe(423);

      expect((await pinLogin('nobody', '1234')).status).toBe(401);
      expect((await pinLogin('naghash1', '12a4')).status).toBe(400);
      // A staff account never gets a PIN session, even with a PIN hash planted.
      await h.db.db.update(users).set({ pinHash: (await h.db.db.select().from(users).where(eq(users.username, 'naghash1')))[0]!.pinHash }).where(eq(users.username, 'parts'));
      expect((await pinLogin('parts', '4321')).status).toBe(401);
    });

    it('resets the PIN, unlocks the account and ends old sessions; deactivation blocks sign-in', async () => {
      const list: { id: string; username: string }[] = (await admin.post('/staff/technicians', { displayName: 'مکانیک آزمون', username: 'mechanic1', pin: '1111' })).body;
      const t = list.find((x) => x.username === 'mechanic1')!;
      const first = await pinLogin('mechanic1', '1111');
      expect(first.status).toBe(200);
      // Phase 3: the system administrator (not the owner) unlocks only with a written reason.
      const withoutReason = await admin.put(`/staff/technicians/${t.id}/pin`, { pin: '2222' });
      expect(withoutReason.status).toBe(422);
      expect(withoutReason.body.code).toBe('SUPPORT_REASON_REQUIRED');
      const reset = await admin.put(`/staff/technicians/${t.id}/pin`, { pin: '2222', reason: 'رمز را فراموش کرده بود (آزمون)' });
      expect(reset.status).toBe(200);
      const open = await h.db.db.select().from(sessions).where(eq(sessions.userId, t.id));
      expect(open.every((s) => s.revokedAt)).toBe(true);
      expect((await pinLogin('mechanic1', '1111')).status).toBe(401);
      expect((await pinLogin('mechanic1', '2222')).status).toBe(200);

      expect((await admin.put(`/staff/technicians/${t.id}/active`, { active: false })).body.code).toBe('SUPPORT_REASON_REQUIRED');
      expect((await admin.put(`/staff/technicians/${t.id}/active`, { active: false, reason: 'پایان همکاری (آزمون)' })).status).toBe(200);
      expect((await pinLogin('mechanic1', '2222')).status).toBe(401);
    });

    it('needs user.manage to manage technician accounts and refuses duplicate usernames', async () => {
      const qc = await h.login('qc');
      expect((await qc.post('/staff/technicians', { displayName: 'x آزمون', username: 'tech9', pin: '1234' })).status).toBe(403);
      expect((await admin.post('/staff/technicians', { displayName: 'باتری‌ساز', username: 'parts', pin: '1234' })).status).toBe(409);
      const staffId = (await admin.get('/auth/me')).body.id;
      expect((await admin.put(`/staff/technicians/${staffId}/pin`, { pin: '1234' })).status).toBe(422);
    });
  });

  it('works in personal (email + Authenticator) mode without opening any other account to PIN sessions', async () => {
    h = await createHarness({ config: { TOTP_AUTH_ENABLED: 'true', AUTH_TOKEN_SECRET: KEY, COOKIE_SECURE: 'true', PUBLIC_APP_URL: 'https://manage.example.test' } });
    const [tenantRow] = await h.db.db.select({ tenantId: users.tenantId }).from(users).limit(1);
    const { TechniciansService } = await import('../src/auth/technicians.service');
    const svc = h.app.get(TechniciansService);
    const [adminRow] = await h.db.db.select().from(users).where(eq(users.username, 'admin'));
    await svc.create(
      { user: { id: adminRow!.id, tenantId: tenantRow!.tenantId, tenantCode: 'x', tenantName: 'x', isTestTenant: true, username: 'admin', displayName: 'admin', roles: ['system_admin'], permissions: new Set(), sessionId: 'x' } },
      { displayName: 'جلوبندی آزمون', username: 'jolo1', pin: '9876' },
    );
    const ok = await pinLogin('jolo1', '9876');
    expect(ok.status).toBe(200);
    const me = await request(h.app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(ok)).set('x-manage-client', 'test');
    expect(me.status).toBe(200);
    expect(me.body.authentication).toBe('pin');
    // Promoting the account later invalidates its PIN session.
    await h.db.db.update(users).set({ roles: ['technician', 'parts_clerk'] }).where(eq(users.username, 'jolo1'));
    const after = await request(h.app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(ok)).set('x-manage-client', 'test');
    expect(after.status).toBe(401);
  });
});
