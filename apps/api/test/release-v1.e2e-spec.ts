import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { formatJalaliDateInput, formatTimeInput, type CaseDetail, type DailyImport, type Part, type StockCandidate } from '@manage/shared';
import { appVersions, auditEvents, cases, emdadRequests, partCodeCorrections, partRequests, stockReservations, users } from '../src/db/schema';
import { buildEmdadXml, buildStockXlsx, emdadRow, type StockRow } from '../src/daily-reports/fixtures';
import { PrintService } from '../src/print/print.service';
import { ReleasesService } from '../src/releases/releases.service';
import { Client, createHarness, daysAgo, type Harness } from './harness';

// Release v1.0.0 (owner, 2026-11-18): parallel stock + special aid, non-OEM matching,
// «لغو رزرو», owner case deletion, release notes, technical-code correction and the two
// printable checklists. Synthetic data only: TESTVIN…, 0900…, invented codes.
let h: Harness;
let expert: Client;
let parts: Client;
let owner: Client;
let admin: Client;
let snapshotId: string;

const at = (min: number) => {
  const d = new Date(Date.now() + min * 60_000);
  return { reportDate: formatJalaliDateInput(d), reportTime: formatTimeInput(d) };
};
function upload(kind: 'stock' | 'emdad', data: Uint8Array) {
  return request(h.app.getHttpServer())
    .post(`/api/v1/daily-reports/uploads?kind=${kind}&fileName=synthetic.bin`)
    .set('Cookie', parts.cookie)
    .set('x-manage-client', 'test')
    .set('content-type', 'application/octet-stream')
    .send(Buffer.from(data));
}
async function preview(kind: 'stock' | 'emdad', data: Uint8Array): Promise<DailyImport> {
  const u = await upload(kind, data);
  expect(u.status).toBe(201);
  let job: DailyImport = u.body;
  for (let i = 0; i < 300 && ['uploaded', 'parsing'].includes(job.status); i++) {
    await new Promise((r) => setTimeout(r, 50));
    job = (await parts.get(`/daily-reports/imports/${u.body.id}`)).body;
  }
  expect(job.status).toBe('preview');
  return job;
}
const apply = (job: DailyImport, min: number) => parts.post(`/daily-reports/imports/${job.id}/apply`, { declaration: true, declaredToday: true, acceptTemplate: true, ...at(min) });
const sku = (code: string, qty: string, loc: string, desc = `قطعه ساختگی ${code}`): StockRow => ({ 'کد کالا': `_x001F_ ${code}`, 'شرح کالا': desc, 'واحد شمارش': 'عدد', 'موجودي': qty, 'قيمت ميانگين': '1000', 'قيمت فروش': '1500', 'آدرس': loc });

async function newCase(admissionNo: string): Promise<CaseDetail> {
  const res = await expert.post('/cases', {
    customer: { fullName: 'مشتری آزمون نسخه', phone: '09000005555' },
    vehicle: { brand: 'ایران‌خودرو', model: 'دنا', plate: '۱۲ ب ۳۴۵ ایران ۶۷', vin: `TESTVIN${Math.random().toString().slice(2, 12)}` },
    admissionNo,
    admittedAt: daysAgo(3),
    coverageType: 'personal',
    damageDescription: 'آزمون نسخهٔ ۱',
  });
  expect(res.status).toBe(201);
  return res.body;
}
async function newPart(c: CaseDetail, partNumber: string | null, quantity = 1, description = `قطعهٔ آزمون ${partNumber}`): Promise<Part> {
  const res = await expert.post(`/cases/${c.id}/parts`, { description, partNumber, quantity, source: 'company' });
  expect(res.status).toBe(201);
  return res.body;
}
const flow = (p: Pick<Part, 'id' | 'version'>, body: object, c = parts) => c.post(`/parts/${p.id}/flow`, { expectedVersion: p.version, ...body });
const partsOf = async (caseId: string): Promise<Part[]> => (await expert.get(`/cases/${caseId}/parts`)).body;
const one = async (p: Pick<Part, 'id' | 'caseId'>) => (await partsOf(p.caseId)).find((x) => x.id === p.id)!;
const reservationsOf = (partId: string) => h.db.db.select().from(stockReservations).where(eq(stockReservations.partRequestId, partId));
const pdfOf = (c: Client, url: string) => c.get(url).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (d: Buffer) => chunks.push(d)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
const candidates = async (p: Pick<Part, 'id'>) => (await parts.get(`/parts/${p.id}/stock-candidates`)).body as { snapshot: { id: string }; items: StockCandidate[] };

beforeAll(async () => {
  h = await createHarness();
  [expert, parts, admin] = await Promise.all([h.login('expert'), h.login('parts'), h.login('admin')]);
  owner = await h.loginAs('release-owner', ['service_manager']);
  await h.db.db.update(users).set({ isOwner: true }).where(eq(users.username, 'release-owner'));
  const stock = await preview('stock', buildStockXlsx([
    sku('0021436501', '2', 'A-03-02', 'چراغ جلو راست'),
    sku('0021436502', '1', 'A-03-04', 'چراغ جلو راست سازنده دوم'),
    sku('00214365789AB', '3', 'N-01-01', 'چراغ جلو غیرشرکتی'),
    sku('00214366XY', '2', 'N-01-02'),
    sku('0031313101', '4', 'B-01-04', 'سپر جلو'),
    sku('0031313101', '1', 'B-02-01', 'سپر جلو'),
    sku('0041414101', '2', '', 'براکت سپر'),
    sku('0051515101', '5', 'C-02-01', 'گلگیر راست'),
  ]));
  const applied = await apply(stock, -300);
  expect(applied.status).toBe(201);
  snapshotId = applied.body.snapshotId;
  const prof = await owner.get('/daily-reports/profiles/stock');
  expect((await owner.patch('/daily-reports/profiles/stock', { expectedVersion: prof.body.version, completeness: 'partial', scope: 'انبار آزمون نسخه', quantityMeaning: 'on_hand', currency: 'IRR' })).status).toBe(200);
});
afterAll(async () => {
  await h?.close();
});

describe('1 · stock in parallel with a running special-aid request', () => {
  it('offers «استفاده از موجودی» only with usable stock, keeps the request, delivers once and records the arrival as replenishment', async () => {
    const c = await newCase('970001');
    let p = await newPart(c, '00214365');
    p = (await flow(p, { action: 'emdad', emdadNo: '8800001' })).body;
    expect(p).toMatchObject({ flowState: 'emdad', stockUsable: true });
    expect(p.allowedActions).toContain('use_stock');
    // Without usable stock the option is not offered.
    const none = (await flow(await newPart(c, '00999999'), { action: 'emdad' })).body as Part;
    expect(none.allowedActions).not.toContain('use_stock');
    expect((await flow(none, { action: 'use_stock', snapshotId, fullStockCode: '0021436501', locationAddress: 'A-03-02' })).body.code).toBe('STOCK_NOT_CANDIDATE');
    // The accident expert cannot act on stock.
    expect((await flow(p, { action: 'use_stock', snapshotId, fullStockCode: '0021436501', locationAddress: 'A-03-02' }, expert)).status).toBe(403);

    p = (await flow(p, { action: 'use_stock', snapshotId, fullStockCode: '0021436501', locationAddress: 'A-03-02' })).body;
    expect(p).toMatchObject({ flowState: 'stock_parallel', status: 'ordered', source: 'company', emdadNo: '8800001', deliverableQuantity: 1, stockParallel: { reservedQuantity: 1, issuedQuantity: 0 } });
    expect(p.allowedActions).toEqual(expect.arrayContaining(['hand_over', 'release']));
    // Never more than the need: a second use is refused.
    expect((await flow(p, { action: 'use_stock', snapshotId, fullStockCode: '0021436501', locationAddress: 'A-03-02' })).status).toBe(422);

    p = (await flow(p, { action: 'hand_over', recipientName: 'تکنسین آزمون' })).body;
    expect(p).toMatchObject({ flowState: 'handed_over', handedOverQuantity: 1 });
    expect((await reservationsOf(p.id)).map((r) => r.status)).toEqual(['issued']);

    // The special-aid shipment arrives: receipt date recorded, no second reservation or delivery.
    const report = await apply(await preview('emdad', buildEmdadXml([
      emdadRow(1, { 'شماره کارت پذيرش': c.admissionNo!, 'شماره شاسی': c.vehicle.vin!, 'کد قطعه': '00214365', 'کد اختصاصی اولیه': '00214365', 'شماره امداد ویژه': '8800001', 'كد تداركاتي كالا': '0021436501', 'وضعیت امداد ویژه': 'وارد موجودی شده است', 'تاريخ رسيد شدن امداد ويژه در انبار': '1405/08/26', 'شماره درخواست': '' }),
    ])), -200);
    expect(report.status).toBe(201);
    const after = await one(p);
    expect(after).toMatchObject({ flowState: 'handed_over', handedOverQuantity: 1, stockParallel: { replenished: true } });
    expect(after.emdad).toMatchObject({ emdadNo: '8800001', arrived: true });
    expect(after.emdadReceivedAt).not.toBeNull();
    expect(after.emdadReserveNote).toContain('جایگزین موجودی');
    expect((await reservationsOf(p.id)).map((r) => r.status)).toEqual(['issued']);
    // Re-applying the same report changes nothing (idempotent).
    expect((await apply(await preview('emdad', buildEmdadXml([emdadRow(1, { 'شماره کارت پذيرش': c.admissionNo!, 'شماره شاسی': c.vehicle.vin!, 'کد قطعه': '00214365', 'کد اختصاصی اولیه': '00214365', 'شماره امداد ویژه': '8800001', 'كد تداركاتي كالا': '0021436501', 'وضعیت امداد ویژه': 'وارد موجودی شده است', 'تاريخ رسيد شدن امداد ويژه در انبار': '1405/08/26', 'شماره درخواست': '' })])), -150)).status).toBe(201);
    expect(await reservationsOf(p.id)).toHaveLength(1);
    // The request itself is not closed by the stock use.
    const [req] = await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.partRequestId, p.id));
    expect(req!.matchStatus).toBe('matched');
  });

  it('supports quantities above one: part from stock, the rest still covered by the request', async () => {
    const c = await newCase('970002');
    let p = await newPart(c, '00313131', 3, 'سپر جلو');
    p = (await flow(p, { action: 'emdad' })).body;
    p = (await flow(p, { action: 'use_stock', snapshotId, fullStockCode: '0031313101', locationAddress: 'B-02-01' })).body;
    expect(p).toMatchObject({ flowState: 'stock_parallel', stockParallel: { reservedQuantity: 1 }, deliverableQuantity: 1 });
    p = (await flow(p, { action: 'use_stock', snapshotId, fullStockCode: '0031313101', locationAddress: 'B-01-04', quantity: 1 })).body;
    expect(p).toMatchObject({ stockParallel: { reservedQuantity: 2 }, deliverableQuantity: 2 });
    expect((await flow(p, { action: 'use_stock', snapshotId, fullStockCode: '0031313101', locationAddress: 'B-01-04', quantity: 2 })).body.code).toBe('OVER_NEED');
    p = (await flow(p, { action: 'hand_over', recipientName: 'تکنسین آزمون', deliveryQuantity: 2 })).body;
    expect(p).toMatchObject({ flowState: 'stock_parallel', handedOverQuantity: 2, status: 'ordered' });
  });

  it('two concurrent uses of the last unit never oversell', async () => {
    const c = await newCase('970003');
    const a = (await flow(await newPart(c, '00214365', 1, 'چراغ A'), { action: 'emdad' })).body as Part;
    const c2 = await newCase('970004');
    const b = (await flow(await newPart(c2, '00214365', 1, 'چراغ B'), { action: 'emdad' })).body as Part;
    // 0021436502 has exactly one unit.
    const [ra, rb] = await Promise.all([
      flow(a, { action: 'use_stock', snapshotId, fullStockCode: '0021436502', locationAddress: 'A-03-04' }),
      flow(b, { action: 'use_stock', snapshotId, fullStockCode: '0021436502', locationAddress: 'A-03-04' }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const held = await h.db.db.select().from(stockReservations).where(and(eq(stockReservations.fullStockCode, '0021436502'), eq(stockReservations.status, 'reserved')));
    expect(held).toHaveLength(1);
  });
});

describe('2 · non-OEM matching', () => {
  it('lists exact, OEM variants and possible non-OEM candidates separately, with location and classification', async () => {
    const c = await newCase('970010');
    const p = await newPart(c, '0021436501');
    const { items } = await candidates(p);
    const byCode = new Map(items.map((i) => [i.fullStockCode, i]));
    expect(byCode.get('0021436501')).toMatchObject({ match: 'exact', oem: true, locationAddress: 'A-03-02' });
    expect(byCode.get('0021436502')).toMatchObject({ match: 'oem_variant', oem: true });
    expect(byCode.get('00214365789AB')).toMatchObject({ match: 'non_oem', oem: false, locationAddress: 'N-01-01', available: '3' });
    // A different 8-digit prefix is not compatible.
    expect(byCode.has('00214366XY')).toBe(false);
    expect(items.map((i) => i.match)).toEqual([...items.map((i) => i.match)].sort((a, b) => ['exact', 'oem_variant', 'non_oem'].indexOf(a) - ['exact', 'oem_variant', 'non_oem'].indexOf(b)));
    // A non-OEM candidate is reserved only by explicit choice, and reservations lower its usable quantity.
    let q = (await flow(p, { action: 'reserve', snapshotId, fullStockCode: '00214365789AB', locationAddress: 'N-01-01' })).body as Part;
    expect(q.flowState).toBe('reserved');
    const again = (await candidates(await newPart(await newCase('970011'), '00214365'))).items.find((i) => i.fullStockCode === '00214365789AB')!;
    expect(again).toMatchObject({ available: '2', reserved: '1' });
    // The stock search by 8 digits also finds non-OEM codes.
    const search = (await parts.get('/stock/options?q=00214365&pageSize=50')).body as { items: { fullStockCode: string }[] };
    expect(search.items.map((i) => i.fullStockCode)).toContain('00214365789AB');
    q = (await flow(q, { action: 'release', reason: 'انتخاب اشتباه کالا' })).body;
    expect(q.flowState).toBe('needed');
  });
});

describe('3 · «لغو رزرو»', () => {
  it('releases only the reservation, keeps the line on the case as «تعیین تکلیف نشده», and returns the stock', async () => {
    const c = await newCase('970020');
    let p = await newPart(c, '00515151', 2, 'گلگیر راست');
    p = (await flow(p, { action: 'reserve', snapshotId, fullStockCode: '0051515101', locationAddress: 'C-02-01' })).body;
    expect(p).toMatchObject({ flowState: 'reserved', reservedQuantity: 2 });
    expect(p.allowedActions).toContain('release');
    expect(p.allowedActions).not.toContain('cancel');
    expect((await flow(p, { action: 'release', reason: '' })).status).toBe(400);
    expect((await flow(p, { action: 'release', reason: 'تصمیم دیگر' }, expert)).status).toBe(403);
    p = (await flow(p, { action: 'release', reason: 'تصمیم دیگر برای تأمین' })).body;
    expect(p).toMatchObject({ flowState: 'needed', status: 'needed', reservedQuantity: 0, cancelledAt: null });
    expect((await partsOf(c.id)).some((x) => x.id === p.id)).toBe(true);
    expect((await reservationsOf(p.id)).map((r) => r.status)).toEqual(['released']);
    // A second release finds nothing to release (no duplicate release rows).
    expect((await flow(p, { action: 'release', reason: 'دوباره' })).status).toBe(422);
    const usable = (await candidates(p)).items.find((i) => i.fullStockCode === '0051515101')!;
    expect(usable.available).toBe('5');
    // A new decision is possible right away.
    p = (await flow(p, { action: 'reserve', snapshotId, fullStockCode: '0051515101', locationAddress: 'C-02-01' })).body;
    expect(p.flowState).toBe('reserved');
    // A delivered part is never undone by «لغو رزرو».
    p = (await flow(p, { action: 'hand_over', recipientName: 'تکنسین آزمون', deliveryQuantity: 1 })).body;
    expect(p.allowedActions).not.toContain('release');
    expect((await flow(p, { action: 'release', reason: 'آزمون' })).body.code).toBe('PART_PARTIAL_DELIVERY_RELEASE');
  });

  it('with a running special-aid request only the stock reservation is cancelled', async () => {
    const c = await newCase('970021');
    let p = await newPart(c, '00313131');
    p = (await flow(p, { action: 'emdad', emdadNo: '8800021' })).body;
    p = (await flow(p, { action: 'use_stock', snapshotId, fullStockCode: '0031313101', locationAddress: 'B-01-04' })).body;
    expect(p.flowState).toBe('stock_parallel');
    p = (await flow(p, { action: 'release', reason: 'قطعهٔ امداد زود می‌رسد' })).body;
    expect(p).toMatchObject({ flowState: 'emdad', status: 'ordered', source: 'company', emdadNo: '8800021', stockParallel: null, cancelledAt: null });
    expect((await reservationsOf(p.id)).map((r) => r.status)).toEqual(['released']);
  });
});

describe('4 · owner-only recoverable case deletion', () => {
  it('only the owner deletes and restores; deleted cases leave every list; reservations are released and never recreated', async () => {
    const c = await newCase('970030');
    let p = await newPart(c, '00515151', 1);
    p = (await flow(p, { action: 'reserve', snapshotId, fullStockCode: '0051515101', locationAddress: 'C-02-01' })).body;
    const detail = (await expert.get(`/cases/${c.id}`)).body as CaseDetail;
    const body = { expectedVersion: detail.version, reason: 'پروندهٔ آزمایشی', confirm: true };
    for (const who of [expert, parts, admin]) {
      expect((await who.post(`/cases/${c.id}/delete`, body)).status).toBe(403);
      expect((await who.get('/deleted-cases')).status).toBe(403);
    }
    expect((await owner.post(`/cases/${c.id}/delete`, { ...body, confirm: false })).status).toBe(400);
    const del = await owner.post(`/cases/${c.id}/delete`, body);
    expect(del.status).toBe(201);
    expect(del.body).toMatchObject({ status: 'deleted', releasedReservations: 1 });
    expect((await expert.get(`/cases/${c.id}`)).status).toBe(404);
    expect(((await expert.get('/cases?status=all&pageSize=100')).body.items as { id: string }[]).some((x) => x.id === c.id)).toBe(false);
    expect(((await expert.get(`/cases?q=970030`)).body.items as unknown[])).toHaveLength(0);
    expect(((await expert.get('/desk/folders')).body as { caseId: string }[]).some((f) => f.caseId === c.id)).toBe(false);
    expect((await reservationsOf(p.id)).map((r) => r.status)).toEqual(['released']);
    const listed = (await owner.get('/deleted-cases?q=970030')).body as { id: string; reason: string; deletedBy: { displayName: string } }[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: c.id, reason: 'پروندهٔ آزمایشی' });
    // Nothing was physically removed.
    expect(await h.db.db.select().from(partRequests).where(eq(partRequests.caseId, c.id))).toHaveLength(1);
    expect((await h.db.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, c.id), eq(auditEvents.action, 'case.deleted')))).length).toBe(1);

    const [row] = await h.db.db.select({ version: cases.version }).from(cases).where(eq(cases.id, c.id));
    expect((await expert.post(`/cases/${c.id}/restore`, { expectedVersion: row!.version })).status).toBe(403);
    expect((await owner.post(`/cases/${c.id}/restore`, { expectedVersion: row!.version })).body).toMatchObject({ status: 'open' });
    expect((await expert.get(`/cases/${c.id}`)).status).toBe(200);
    const restored = await one(p);
    expect(restored).toMatchObject({ flowState: 'needed', reservedQuantity: 0 });
    expect((await reservationsOf(p.id)).map((r) => r.status)).toEqual(['released']);
    expect((await owner.post(`/cases/${c.id}/restore`, { expectedVersion: row!.version + 1 })).status).toBe(409);
  });
});

describe('5 · version and release notes', () => {
  it('numbers each confirmed release once, never a failed attempt, and keeps the older number after a rollback', async () => {
    const svc = h.app.get(ReleasesService);
    const patch = (v: string) => Number(v.split('.')[2]);
    const health = async () => (await request(h.app.getHttpServer()).get('/api/v1/health')).body as { version: string | null; line: string };
    const saved = process.env.GIT_COMMIT;
    try {
      process.env.GIT_COMMIT = 'aaaaaaa11111';
      // Started but not confirmed: no number and no announcement yet.
      expect((await expert.get('/releases/current')).body).toMatchObject({ version: null, line: 'v1.0', seen: true });
      expect(await health()).toMatchObject({ version: null, line: 'v1.0' });
      const first = await svc.confirm('aaaaaaa11111');
      expect(first.created).toBe(true);
      // Re-running the same release does not create another number.
      expect(await svc.confirm('aaaaaaa11111')).toMatchObject({ version: first.version, created: false });
      expect(await svc.confirm('AAAAAAA11111fff')).toMatchObject({ version: first.version, created: false });
      const cur = (await expert.get('/releases/current')).body;
      expect(cur).toMatchObject({ version: first.version, seen: false, commit: 'aaaaaaa11111' });
      expect(cur.summary.length).toBeGreaterThan(20);
      expect((await health()).version).toBe(first.version);

      // A failed attempt: the new image started, failed its checks and was rolled back before confirmation.
      process.env.GIT_COMMIT = 'bbbbbbb22222';
      expect((await expert.get('/releases/current')).body.version).toBeNull();
      // Rollback: the older commit shows the number it already had.
      process.env.GIT_COMMIT = 'aaaaaaa11111';
      expect((await expert.get('/releases/current')).body.version).toBe(first.version);

      // The next successful release gets the next patch; the failed commit never got one.
      const next = await svc.confirm('ccccccc33333');
      expect(patch(next.version)).toBe(patch(first.version) + 1);
      expect(next.noteKeys).toEqual([]);
      const history = (await parts.get('/releases')).body as { version: string; commit: string; running: boolean; summary: string; sections: { items: string[] }[] }[];
      expect(history.map((r) => r.version)).toEqual([next.version, first.version]);
      expect(history.map((r) => r.commit)).not.toContain('bbbbbbb22222');
      expect(history[1]!.running).toBe(true);
      expect(history[1]!.sections.flatMap((s) => s.items).length).toBeGreaterThanOrEqual(8);
      expect((await h.db.db.select().from(appVersions)).length).toBe(2);
      await expect(svc.confirm('not-a-commit')).rejects.toThrow();

      expect((await expert.post('/releases/ack', { version: 'v0.0.1' })).status).toBe(422);
      expect((await expert.post('/releases/ack', { version: first.version })).body.seen).toBe(true);
      expect((await expert.get('/releases/current')).body.seen).toBe(true);
      expect((await parts.get('/releases/current')).body.seen).toBe(false);
      expect((await request(h.app.getHttpServer()).get('/api/v1/releases/current')).status).toBe(401);
    } finally {
      if (saved === undefined) delete process.env.GIT_COMMIT;
      else process.env.GIT_COMMIT = saved;
    }
  });
});

describe('6 · technical-code correction', () => {
  it('returns only the chosen line to the expert, keeps both codes in history and rematches stock', async () => {
    const c = await newCase('970040');
    const wrong = await newPart(c, '00999988', 1, 'چراغ جلو راست');
    const other = await newPart(c, '00515151', 1, 'گلگیر راست');
    expect((await parts.post(`/parts/${wrong.id}/code-correction`, { expectedVersion: wrong.version, reason: 'کو' })).status).toBe(400);
    expect((await expert.post(`/parts/${wrong.id}/code-correction`, { expectedVersion: wrong.version, reason: 'شماره فنی با مدل خودرو مطابقت ندارد' })).status).toBe(403);
    const req = await parts.post(`/parts/${wrong.id}/code-correction`, { expectedVersion: wrong.version, reason: 'شماره فنی ثبت‌شده با مدل خودرو مطابقت ندارد. لطفاً بررسی و اصلاح شود.' });
    expect(req.status).toBe(201);
    expect(req.body.codeCorrection).toMatchObject({ status: 'open', originalCode: '00999988', blockers: [] });
    expect((await parts.post(`/parts/${wrong.id}/code-correction`, { expectedVersion: req.body.version, reason: 'درخواست تکراری آزمون' })).status).toBe(409);
    const list = await partsOf(c.id);
    expect(list.find((x) => x.id === other.id)!.codeCorrection).toBeNull();
    const correctionId = req.body.codeCorrection.id as string;
    // Only the accident expert corrects; a stale version is refused.
    expect((await parts.post(`/code-corrections/${correctionId}/resolve`, { expectedVersion: req.body.version, correctedCode: '00214365' })).status).toBe(403);
    expect((await expert.post(`/code-corrections/${correctionId}/resolve`, { expectedVersion: wrong.version, correctedCode: '00214365' })).status).toBe(409);
    expect((await expert.post(`/code-corrections/${correctionId}/resolve`, { expectedVersion: req.body.version, correctedCode: '00515151' })).body.code).toBe('DUPLICATE_PART_CODE');
    const fixed = await expert.post(`/code-corrections/${correctionId}/resolve`, { expectedVersion: req.body.version, correctedCode: ' 0021-4365 ' });
    expect(fixed.status).toBe(201);
    expect(fixed.body).toMatchObject({ partNumber: '00214365', flowState: 'needed', codeCorrection: { status: 'resolved', originalCode: '00999988', correctedCode: '00214365' } });
    const [row] = await h.db.db.select().from(partCodeCorrections).where(eq(partCodeCorrections.id, correctionId));
    expect(row).toMatchObject({ originalCode: '00999988', correctedCode: '00214365', previousStatus: 'needed', status: 'resolved' });
    expect(row!.resolvedBy).not.toBeNull();
    // Stock is matched for the corrected code at once.
    expect((await candidates(fixed.body)).items.map((i) => i.fullStockCode)).toContain('0021436501');
  });

  it('never moves a reservation, delivery or special-aid order to the corrected code', async () => {
    const c = await newCase('970041');
    let p = await newPart(c, '00515151');
    p = (await flow(p, { action: 'reserve', snapshotId, fullStockCode: '0051515101', locationAddress: 'C-02-01' })).body;
    const req = (await parts.post(`/parts/${p.id}/code-correction`, { expectedVersion: p.version, reason: 'کد با مدل خودرو نمی‌خواند' })).body as Part;
    expect(req.codeCorrection!.blockers.join(' ')).toContain('لغو رزرو');
    const refused = await expert.post(`/code-corrections/${req.codeCorrection!.id}/resolve`, { expectedVersion: req.version, correctedCode: '00313131' });
    expect(refused.body.code).toBe('CORRECTION_BLOCKED');
    expect((await one(p)).partNumber).toBe('00515151');
    const e = await newPart(c, '00616161');
    const ordered = (await flow(e, { action: 'emdad', emdadNo: '8800041' })).body as Part;
    const r2 = (await parts.post(`/parts/${e.id}/code-correction`, { expectedVersion: ordered.version, reason: 'کد با مدل خودرو نمی‌خواند' })).body as Part;
    expect((await expert.post(`/code-corrections/${r2.codeCorrection!.id}/resolve`, { expectedVersion: r2.version, correctedCode: '00313131' })).body.code).toBe('CORRECTION_BLOCKED');
    expect((await one(e))).toMatchObject({ flowState: 'emdad', emdadNo: '8800041', partNumber: '00616161' });
  });
});

describe('7 · warehouse picking checklist', () => {
  it('prints the selected item locations (several per part, blank when unknown) and changes nothing', async () => {
    const c = await newCase('970050');
    const bumper = await newPart(c, '00313131', 2, 'سپر جلو');
    expect((await flow(bumper, { action: 'reserve', snapshotId, fullStockCode: '0031313101', locationAddress: 'B-01-04' })).status).toBe(201);
    const bracket = await newPart(c, '00414141', 1, 'براکت سپر');
    expect((await flow(bracket, { action: 'reserve', snapshotId, fullStockCode: '0041414101', locationAddress: '' })).status).toBe(201);
    const lamp = await newPart(c, '00214365', 1, 'چراغ جلو غیرشرکتی');
    expect((await flow(lamp, { action: 'reserve', snapshotId, fullStockCode: '00214365789AB', locationAddress: 'N-01-01' })).status).toBe(201);
    await newPart(c, '00777777', 1, 'قطعهٔ ناموجود');
    const before = await h.db.db.select().from(stockReservations).where(eq(stockReservations.caseId, c.id));
    const actor = { user: { ...(await parts.get('/auth/me')).body, permissions: new Set((await parts.get('/auth/me')).body.permissions), tenantId: (await h.db.db.select({ t: cases.tenantId }).from(cases).where(eq(cases.id, c.id)))[0]!.t } } as never;
    const svc = h.app.get(PrintService);
    const pick = await svc.pickingRows(actor, c.id, 'pick');
    const cells = pick.rows.map((r) => r.cells);
    expect(cells.map((r) => [r[2], r[3], r[4], r[5]])).toEqual([
      ['سپر جلو', '0031313101', '2', 'B-01-04'],
      ['چراغ جلو غیرشرکتی', '00214365789AB', '1', 'N-01-01'],
      ['براکت سپر', '0041414101', '1', ''],
    ]);
    expect(cells[1]![6]).toContain('غیرشرکتی');
    const all = await svc.pickingRows(actor, c.id, 'all');
    const missing = all.rows.find((r) => r.cells[2] === 'قطعهٔ ناموجود')!;
    expect(missing).toMatchObject({ muted: true });
    expect(missing.cells[5]).toBe('');
    expect(missing.cells[6]).toContain('برداشت نشود');
    const pdf = await pdfOf(parts, `/print/cases/${c.id}/picking.pdf?scope=all`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await expert.get(`/print/cases/${c.id}/picking.pdf`)).status).toBe(200);
    expect((await h.loginAs('picking-tech', ['technician'])).get(`/print/cases/${c.id}/picking.pdf`)).resolves.toMatchObject({ status: 403 });
    expect(await h.db.db.select().from(stockReservations).where(eq(stockReservations.caseId, c.id))).toEqual(before);
  });

  it('splits a long list over several A4 pages', async () => {
    const c = await newCase('970051');
    for (let i = 0; i < 45; i++) await newPart(c, `0080${String(i).padStart(4, '0')}`, 1, `قطعهٔ شمارهٔ ${i + 1} با نام طولانی برای آزمون شکستن سطر در برگهٔ چاپی`);
    const pdf = await pdfOf(parts, `/print/cases/${c.id}/picking.pdf?scope=all`);
    const text = Buffer.from(pdf.body as Buffer).toString('latin1');
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});

describe('8 · daily inspection checklist', () => {
  it('lists active accident vehicles in the dealership, delayed first, without delivered or deleted cases', async () => {
    const delayed = await newCase('970060');
    await h.db.db.update(cases).set({ officialDeadlineAt: new Date(Date.now() - 86_400_000) }).where(eq(cases.id, delayed.id));
    const gone = await newCase('970061');
    const v = (await expert.get(`/cases/${gone.id}`)).body as CaseDetail;
    expect((await owner.post(`/cases/${gone.id}/delete`, { expectedVersion: v.version, reason: 'آزمون حذف', confirm: true })).status).toBe(201);
    const delivered = await newCase('970062');
    await h.db.db.update(cases).set({ stage: 'delivered' }).where(eq(cases.id, delivered.id));
    const me = (await expert.get('/auth/me')).body;
    const actor = { user: { ...me, permissions: new Set(me.permissions), tenantId: (await h.db.db.select({ t: cases.tenantId }).from(cases).where(eq(cases.id, delayed.id)))[0]!.t } } as never;
    const r = await h.app.get(PrintService).inspectionRows(actor);
    const ids = r.items.map((x) => x.caseId);
    expect(ids).toContain(delayed.id);
    expect(ids).not.toContain(gone.id);
    expect(ids).not.toContain(delivered.id);
    expect(r.items[0]).toMatchObject({ caseId: delayed.id, late: true });
    // Working days are whole days of the dealership calendar (3 calendar days back → at most 3).
    expect(r.items.find((x) => x.caseId === delayed.id)!.days).toBeLessThanOrEqual(3);
    const row = r.rows[0]!.cells;
    expect(row[3]).toMatch(/345/);
    expect(row[4]).toContain('970060');
    expect(row[9]).toContain('تأخیر');
    const pdf = await pdfOf(expert, '/print/inspection.pdf');
    expect(pdf.status).toBe(200);
    expect(Buffer.from(pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await parts.get('/print/inspection.pdf')).status).toBe(403);
    // Read-only: printing changed no case.
    const [after] = await h.db.db.select({ version: cases.version }).from(cases).where(eq(cases.id, delayed.id));
    expect((await h.db.db.select({ version: cases.version }).from(cases).where(inArray(cases.id, [delayed.id])))[0]).toEqual(after);
  });
});
