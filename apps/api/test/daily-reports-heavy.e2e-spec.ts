import { eq } from 'drizzle-orm';
import request from 'supertest';
import { formatJalaliDateInput, type DailyImport } from '@manage/shared';
import { dailyReportImports, stockSnapshots } from '../src/db/schema';
import { DailyReportsService } from '../src/daily-reports/daily-reports.service';
import { buildStockXlsx, type StockRow } from '../src/daily-reports/fixtures';
import { Client, createHarness, type Harness } from './harness';

// Heavy daily reports (owner, 2026-11-25): confirming a large file runs as a background job.
// DAILY_APPLY_WAIT_MS=0 makes every confirmation take the background path, as a file that needs
// minutes would. Synthetic files only.

const day = (n: number) => formatJalaliDateInput(new Date(Date.now() - n * 86_400_000));
const rows = (n: number, qty: string): StockRow[] => Array.from({ length: n }, (_, i) => ({
  'کد کالا': `_x001F_ ${String(10_000_000 + i).padStart(8, '0')}01`, 'شرح کالا': `قطعه ساختگی ${i}`, 'واحد شمارش': 'عدد',
  'موجودي': qty, 'قيمت ميانگين': '1000', 'قيمت فروش': '1500', 'آدرس': `A-${i % 50}`,
}));

function upload(h: Harness, c: Client, data: Uint8Array, fileName: string) {
  return request(h.app.getHttpServer())
    .post(`/api/v1/daily-reports/uploads?kind=stock&fileName=${encodeURIComponent(fileName)}`)
    .set('Cookie', c.cookie).set('x-manage-client', 'test').set('content-type', 'application/octet-stream')
    .send(Buffer.from(data));
}
async function until(c: Client, id: string, working: string[], tries = 1200): Promise<DailyImport> {
  for (let i = 0; i < tries; i++) {
    const r = await c.get(`/daily-reports/imports/${id}`);
    if (!working.includes(r.body.status)) return r.body;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error('import did not finish');
}
async function preview(h: Harness, c: Client, data: Uint8Array, name: string) {
  const u = await upload(h, c, data, name);
  expect(u.status).toBe(201);
  const p = await until(c, u.body.id, ['uploaded', 'parsing']);
  expect(p.status).toBe('preview');
  return p;
}
const active = (h: Harness) => h.db.db.select().from(stockSnapshots).where(eq(stockSnapshots.status, 'active'));

describe('heavy stock report confirmed in the background', () => {
  let h: Harness;
  let manager: Client;
  beforeAll(async () => {
    h = await createHarness({ config: { DAILY_APPLY_WAIT_MS: '0', DAILY_REPORT_MAX_BYTES: '32000000' } });
    manager = await h.login('admin');
  });
  afterAll(async () => { await h?.close(); });

  it('accepts a large file at once, ignores duplicate submissions and publishes exactly one snapshot', async () => {
    const p = await preview(h, manager, buildStockXlsx(rows(12_000, '3')), 'large-stock.xlsx');
    const body = { reportDate: day(2), declaration: true };
    const first = await manager.post(`/daily-reports/imports/${p.id}/apply`, body);
    expect(first.status).toBe(201);
    expect(first.body.accepted).toBe(true);
    expect(['applying', 'applied']).toContain(first.body.import.status);
    // A double click, a second tab and a retry after a lost answer all follow the same job.
    const again = await Promise.all([1, 2, 3].map(() => manager.post(`/daily-reports/imports/${p.id}/apply`, body)));
    for (const r of again) expect([201, 409]).toContain(r.status);
    for (const r of again.filter((x) => x.status === 201)) expect(r.body.accepted).toBe(true);
    for (const r of again.filter((x) => x.status === 409)) expect(r.body.code).toBe('DAILY_ALREADY_APPLIED');
    const done = await until(manager, p.id, ['applying']);
    expect(done.status).toBe('applied');
    expect(done.counts).toMatchObject({ published: 12_000 });
    const snaps = await active(h);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.itemCount).toBe(12_000);
  }, 240_000);

  it('a failed publish returns to the preview with its reason and keeps the previous stock; a retry succeeds', async () => {
    const [before] = await active(h);
    const p = await preview(h, manager, buildStockXlsx(rows(500, '7')), 'older-stock.xlsx');
    // Older than the active report: refused inside the job, after the request was answered.
    const accepted = await manager.post(`/daily-reports/imports/${p.id}/apply`, { reportDate: day(9), declaration: true });
    expect(accepted.body.accepted).toBe(true);
    const failed = await until(manager, p.id, ['applying']);
    expect(failed.status).toBe('preview');
    expect(failed.diagnostics.applyError).toMatchObject({ code: 'DAILY_OLDER_REPORT' });
    const [still] = await active(h);
    expect(still!.id).toBe(before!.id);
    expect(still!.itemCount).toBe(before!.itemCount);
    // Safe retry with the correct date: the same import is published once.
    await manager.post(`/daily-reports/imports/${p.id}/apply`, { reportDate: day(1), declaration: true });
    const ok = await until(manager, p.id, ['applying']);
    expect(ok.status).toBe('applied');
    expect(ok.diagnostics.applyError).toBeUndefined();
    const [now] = await active(h);
    expect(now!.importId).toBe(p.id);
  }, 120_000);

  it('a publish interrupted by a restart returns to its preview; nothing was changed', async () => {
    const [before] = await active(h);
    const p = await preview(h, manager, buildStockXlsx(rows(50, '1')), 'interrupted.xlsx');
    await h.db.db.update(dailyReportImports)
      .set({ status: 'applying', diagnostics: { ...p.diagnostics, applyStartedAt: new Date(Date.now() - 3_600_000).toISOString() } })
      .where(eq(dailyReportImports.id, p.id));
    await h.app.get(DailyReportsService).recover(new Date());
    const back = (await manager.get(`/daily-reports/imports/${p.id}`)).body as DailyImport;
    expect(back.status).toBe('preview');
    expect(back.diagnostics.applyError).toMatchObject({ code: 'DAILY_APPLY_INTERRUPTED' });
    expect((await active(h))[0]!.id).toBe(before!.id);
  }, 60_000);
});

describe('a lost connection does not cancel an accepted publish', () => {
  let h: Harness;
  let manager: Client;
  beforeAll(async () => {
    h = await createHarness({ config: { DAILY_APPLY_WAIT_MS: '25000', DAILY_REPORT_MAX_BYTES: '32000000' } });
    manager = await h.login('admin');
  });
  afterAll(async () => { await h?.close(); });

  it('the browser gives up mid-request; the job still finishes and the page finds it applied', async () => {
    const p = await preview(h, manager, buildStockXlsx(rows(12_000, '2')), 'dropped.xlsx');
    const aborted = await request(h.app.getHttpServer())
      .post(`/api/v1/daily-reports/imports/${p.id}/apply`)
      .set('Cookie', manager.cookie).set('x-manage-client', 'test')
      .send({ reportDate: day(1), declaration: true })
      .timeout(30)
      .then(() => 'answered', () => 'aborted');
    expect(['aborted', 'answered']).toContain(aborted);
    const done = await until(manager, p.id, ['preview', 'applying']);
    expect(done.status).toBe('applied');
    expect(await active(h)).toHaveLength(1);
  }, 240_000);
});
