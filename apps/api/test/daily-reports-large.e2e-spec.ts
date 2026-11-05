import request from 'supertest';
import type { DailyImport } from '@manage/shared';
import { buildEmdadXml, emdadRow } from '../src/daily-reports/fixtures';
import { createHarness, type Harness } from './harness';

// Full-size synthetic Emdad export (~23.6 MB, 5,183 rows + totals) through the
// real upload route with the default 32 MiB limit.

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h?.close();
});

it('uploads, parses and applies a ~23.6 MB SpreadsheetML file within time and memory bounds', async () => {
  const manager = await h.login('admin');
  const rows = Array.from({ length: 5183 }, (_, i) => emdadRow(i + 1, { 'شرح اختصاصی': `قطعه ساختگی ${i} & ${'x'.repeat(4200)}` }));
  const file = buildEmdadXml(rows);
  expect(file.length).toBeGreaterThan(23_000_000);
  expect(file.length).toBeLessThan(32 * 1024 * 1024);
  const before = process.memoryUsage().rss;
  const started = Date.now();
  const u = await request(h.app.getHttpServer())
    .post('/api/v1/daily-reports/uploads?kind=emdad&fileName=large.xls')
    .set('Cookie', manager.cookie)
    .set('x-manage-client', 'test')
    .set('content-type', 'application/octet-stream')
    .send(Buffer.from(file));
  expect(u.status).toBe(201);
  let imp: DailyImport = u.body;
  for (let i = 0; i < 1200 && ['uploaded', 'parsing'].includes(imp.status); i++) {
    await new Promise((r) => setTimeout(r, 100));
    imp = (await manager.get(`/daily-reports/imports/${imp.id}`)).body;
  }
  expect(imp.status).toBe('preview');
  expect(imp.counts).toMatchObject({ new: 5183, total_row: 1, total: 5184 });
  expect(imp.diagnostics).toMatchObject({ leadingWhitespace: 1, unescapedAmpersands: 5183 });
  const applied = await manager.post(`/daily-reports/imports/${imp.id}/apply`, { reportDate: '1405/08/01', declaration: true });
  expect(applied.status).toBe(201);
  expect(applied.body.counts).toMatchObject({ inserted: 5183 });
  expect(Date.now() - started).toBeLessThan(180_000);
  // Reported, not hidden: growth of the whole test process (file, staging and PGlite).
  const growthMb = Math.round((process.memoryUsage().rss - before) / 1024 / 1024);
  console.log(`large Emdad import: ${Date.now() - started} ms, rss growth ${growthMb} MB`);
  expect(growthMb).toBeLessThan(1500);
}, 240_000);
