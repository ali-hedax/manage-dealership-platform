import { eq } from 'drizzle-orm';
import request from 'supertest';
import { formatJalaliDateInput, formatTimeInput, type CaseDetail, type DailyImport, type Part } from '@manage/shared';
import { DailyTasksService } from '../src/daily-reports/daily-tasks.service';
import { buildStockXlsx, type StockRow } from '../src/daily-reports/fixtures';
import { dailyTasks, notifications, stockReservations, stockSnapshots, users } from '../src/db/schema';
import { Client, createHarness, daysAgo, type Harness } from './harness';

// Locks only mean something with several connections, which PGlite does not
// have. CI runs this file against a real PostgreSQL (see .github/workflows/ci.yml).
const url = process.env.DAILY_PG_TEST_URL;
const suite = url ? describe : describe.skip;

suite('daily reports on real PostgreSQL', () => {
  let h: Harness;
  let manager: Client, parts: Client, expert: Client, owner: Client;
  const sku = (suffix: string, qty: string): StockRow => ({ 'کد کالا': `_x001F_ 12345678${suffix}`, 'شرح کالا': 'قطعه ساختگی', 'واحد شمارش': 'عدد', 'موجودي': qty, 'قيمت ميانگين': '10', 'قيمت فروش': '20', 'آدرس': `A-${suffix}` });
  const ahead = (min: number) => {
    const d = new Date(Date.now() + min * 60_000);
    return { reportDate: formatJalaliDateInput(d), reportTime: formatTimeInput(d), declaration: true };
  };

  async function preview(rows: StockRow[]): Promise<DailyImport> {
    const u = await request(h.app.getHttpServer())
      .post('/api/v1/daily-reports/uploads?kind=stock&fileName=synthetic.xlsx')
      .set('Cookie', manager.cookie)
      .set('x-manage-client', 'test')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.from(buildStockXlsx(rows)));
    expect(u.status).toBe(201);
    for (let i = 0; i < 200; i++) {
      const r = await manager.get(`/daily-reports/imports/${u.body.id}`);
      if (!['uploaded', 'parsing'].includes(r.body.status)) return r.body;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error('import did not finish');
  }
  async function need(admissionNo: string, quantity: number): Promise<Part> {
    const c = await expert.post('/cases', {
      customer: { fullName: 'مشتری آزمون', phone: '09000006666' },
      vehicle: { brand: 'ایران‌خودرو', model: 'دنا', vin: `TESTVIN${Math.random().toString().slice(2, 12)}` },
      admissionNo,
      admittedAt: daysAgo(1),
      damageDescription: 'آزمون',
    });
    expect(c.status).toBe(201);
    const p = await expert.post(`/cases/${(c.body as CaseDetail).id}/parts`, { description: 'نیاز آزمون', partNumber: '12345678', quantity, source: 'stock' });
    expect(p.status).toBe(201);
    return p.body;
  }

  let snapshotId: string;
  beforeAll(async () => {
    h = await createHarness({ config: { DB_DRIVER: 'postgres', DATABASE_URL: url! } });
    [manager, parts, expert] = await Promise.all(['admin', 'parts', 'expert'].map((u) => h.login(u)));
    const ownerName = `daily-pg-owner-${Date.now()}`;
    owner = await h.loginAs(ownerName, ['service_manager']);
    const p = await preview(['01', '02', '03'].map((s) => sku(s, '3')));
    const applied = await manager.post(`/daily-reports/imports/${p.id}/apply`, { reportDate: formatJalaliDateInput(new Date(Date.now() - 86_400_000)), declaration: true });
    expect(applied.status).toBe(201);
    snapshotId = applied.body.snapshotId;
    await h.db.db.update(users).set({ isOwner: true }).where(eq(users.username, ownerName));
    const prof = await owner.get('/daily-reports/profiles/stock');
    expect((await owner.patch('/daily-reports/profiles/stock', { expectedVersion: prof.body.version, completeness: 'partial', scope: 'انبار آزمون', quantityMeaning: 'on_hand' })).status).toBe(200);
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  });

  it('never oversells a code when many people reserve it at once', async () => {
    const needs = await Promise.all(Array.from({ length: 8 }, (_, i) => need(`82000${i}`, 1)));
    const results = await Promise.all(needs.map((n) => parts.post('/stock/reservations', { partRequestId: n.id, fullStockCode: '1234567801', locationAddress: 'A-01', snapshotId, quantity: '1', confirm: true })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === 'INSUFFICIENT_STOCK')).toBe(true);
    const opt = (await parts.get('/stock/options?q=1234567801')).body.items[0];
    expect(opt).toMatchObject({ reported: '3', reserved: '3', available: '0' });
  });

  it('never exceeds a need filled from several codes at once', async () => {
    const n = await need('820010', 1);
    const results = await Promise.all(['02', '03'].map((s) => parts.post('/stock/reservations', { partRequestId: n.id, fullStockCode: `12345678${s}`, locationAddress: `A-${s}`, snapshotId, quantity: '1', confirm: true })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(results.find((r) => r.status === 422)!.body.code).toBe('OVER_NEED');
    expect(await h.db.db.select().from(stockReservations).where(eq(stockReservations.partRequestId, n.id))).toHaveLength(1);
  });

  it('keeps one active report and a correct availability when a report and reservations race', async () => {
    const needs = await Promise.all(Array.from({ length: 4 }, (_, i) => need(`82002${i}`, 1)));
    const next = await preview(['01', '02', '03'].map((s) => sku(s, '4')));
    const [pub, ...res] = await Promise.all([
      manager.post(`/daily-reports/imports/${next.id}/apply`, ahead(1)),
      ...needs.map((n) => parts.post('/stock/reservations', { partRequestId: n.id, fullStockCode: '1234567803', locationAddress: 'A-03', snapshotId, quantity: '1', confirm: true })),
    ]);
    expect(pub!.status).toBe(201);
    for (const r of res) {
      expect([201, 409]).toContain(r.status);
      if (r.status === 409) expect(['STOCK_REPORT_CHANGED', 'INSUFFICIENT_STOCK']).toContain(r.body.code);
    }
    expect(await h.db.db.select().from(stockSnapshots).where(eq(stockSnapshots.status, 'active'))).toHaveLength(1);
    const rows = await h.db.db.select().from(stockReservations).where(eq(stockReservations.fullStockCode, '1234567803'));
    const committed = rows.filter((r) => r.status === 'reserved').reduce((sum, r) => sum + Number(r.quantity), 0);
    const opt = (await parts.get('/stock/options?q=1234567803')).body.items[0];
    expect(opt).toMatchObject({ reported: '4', reserved: String(committed), available: String(4 - committed) });
  });

  it('publishes a file once when its confirmation is sent twice at the same moment', async () => {
    const next = await preview(['01', '02', '03'].map((s) => sku(s, '5')));
    const body = ahead(2);
    const results = await Promise.all([manager.post(`/daily-reports/imports/${next.id}/apply`, body), manager.post(`/daily-reports/imports/${next.id}/apply`, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await h.db.db.select().from(stockSnapshots).where(eq(stockSnapshots.importId, next.id))).toHaveLength(1);
  });

  it('sends each reminder once when several API workers tick together', async () => {
    const svc = h.app.get(DailyTasksService);
    const at = new Date('2027-01-05T07:31:00Z');
    await Promise.all(Array.from({ length: 6 }, () => svc.tick(at)));
    const tasks = await h.db.db.select().from(dailyTasks).where(eq(dailyTasks.localDate, '2027-01-05'));
    expect(new Set(tasks.map((t) => `${t.tenantId}:${t.kind}`)).size).toBe(tasks.length);
    const sent = (await h.db.db.select().from(notifications)).filter((n) => n.dedupeKey?.endsWith(':2027-01-05'));
    expect(sent.length).toBeGreaterThan(0);
    expect(new Set(sent.map((n) => `${n.userId}:${n.dedupeKey}`)).size).toBe(sent.length);
  });
});
