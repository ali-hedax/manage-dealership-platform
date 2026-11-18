import { DailyReportsService } from '../src/daily-reports/daily-reports.service';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { formatJalaliDateInput, formatTimeInput, type CaseDetail, type DailyImport, type Part } from '@manage/shared';
import { auditEvents, dailyReportFiles, emdadRequests, partRequests, stockReservations, users } from '../src/db/schema';
import { buildEmdadXml, buildStockXlsx, emdadRow, type StockRow } from '../src/daily-reports/fixtures';
import { Client, createHarness, daysAgo, type Harness } from './harness';

// Special-aid identifiers, arrival, automatic reservation and delivery
// (owner instructions of 2026-11-17). Synthetic data only: TESTVIN…, 0900…,
// invented codes and numbers.
let h: Harness;
let expert: Client;
let parts: Client;
let owner: Client;
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
async function publish(rows: ReturnType<typeof emdadRow>[], min: number) {
  const r = await apply(await preview('emdad', buildEmdadXml(rows)), min);
  expect(r.status).toBe(201);
  return r.body as { counts: Record<string, number> };
}

async function newCase(admissionNo: string): Promise<CaseDetail> {
  const res = await expert.post('/cases', {
    customer: { fullName: 'مشتری آزمون امداد', phone: '09000006666' },
    vehicle: { brand: 'ایران‌خودرو', model: 'سورن', vin: `TESTVIN${Math.random().toString().slice(2, 12)}` },
    admissionNo,
    admittedAt: daysAgo(4),
    coverageType: 'golden_card',
    damageDescription: 'آزمون امداد ویژه',
  });
  expect(res.status).toBe(201);
  return res.body;
}
async function companyPart(c: CaseDetail, partNumber: string, quantity = 1, emdadNo?: string): Promise<Part> {
  const res = await expert.post(`/cases/${c.id}/parts`, { description: `قطعهٔ آزمون ${partNumber}`, partNumber, quantity, source: 'company' });
  expect(res.status).toBe(201);
  const reg = await parts.post(`/parts/${res.body.id}/flow`, { expectedVersion: res.body.version, action: 'emdad', ...(emdadNo ? { emdadNo } : {}) });
  expect(reg.status).toBe(201);
  return reg.body;
}
const partsOf = async (caseId: string): Promise<Part[]> => (await expert.get(`/cases/${caseId}/parts`)).body;
const one = async (p: Pick<Part, 'id' | 'caseId'>) => (await partsOf(p.caseId)).find((x) => x.id === p.id)!;
const reservationsOf = (partId: string) => h.db.db.select().from(stockReservations).where(eq(stockReservations.partRequestId, partId));
/** One report row for a case line (the row's admission and VIN come from the case). */
const row = (i: number, c: CaseDetail, code: string, over: Record<string, string> = {}) =>
  emdadRow(i, { 'شماره کارت پذيرش': c.admissionNo ?? '', 'شماره شاسی': c.vehicle.vin ?? '', 'کد قطعه': code, 'کد اختصاصی اولیه': code, 'شماره درخواست': '', ...over });
const sku = (code: string, qty: string, loc: string, price = '1500'): StockRow => ({ 'کد کالا': `_x001F_ ${code}`, 'شرح کالا': `قطعه ساختگی ${code}`, 'واحد شمارش': 'عدد', 'موجودي': qty, 'قيمت ميانگين': '1000', 'قيمت فروش': price, 'آدرس': loc });

beforeAll(async () => {
  h = await createHarness();
  [expert, parts] = await Promise.all([h.login('expert'), h.login('parts')]);
  owner = await h.loginAs('aid-owner', ['service_manager']);
  await h.db.db.update(users).set({ isOwner: true }).where(eq(users.username, 'aid-owner'));
  // Two manufacturer variants of one assessment code (8 digits, leading zeros) plus other codes.
  const stock = await preview('stock', buildStockXlsx([
    sku('0012345601', '1', 'A-01', '1500'), sku('0012345602', '5', 'A-02', '1800'),
    sku('0055887702', '8', 'E-02'), sku('0033445502', '5', 'F-02'), sku('0077665501', '3', 'D-01'), sku('0099887701', '3', 'B-01'), sku('0044332201', '1', 'C-01'),
  ]));
  const applied = await apply(stock, -300);
  expect(applied.status).toBe(201);
  snapshotId = applied.body.snapshotId;
  const prof = await owner.get('/daily-reports/profiles/stock');
  expect((await owner.patch('/daily-reports/profiles/stock', { expectedVersion: prof.body.version, completeness: 'partial', scope: 'انبار آزمون امداد', quantityMeaning: 'on_hand', currency: 'IRR' })).status).toBe(200);
});
afterAll(async () => {
  await h?.close();
});

it('uses the owner-confirmed special quantity column and rejects substitution from the procurement column', async () => {
  const c = await newCase('930010');
  const p = await companyPart(c, '00123456', 1, '0070010');
  const arrival = { 'شماره امداد ویژه': '0070010', 'كد تداركاتي كالا': '0012345602', 'وضعیت امداد ویژه': 'وارد موجودی شده است', 'تاريخ رسيد شدن امداد ويژه در انبار': '1405/08/22 09:15', 'تعداد تداركاتي': '5' };
  await publish([row(10, c, '00123456', { ...arrival, 'تعداد اختصاصي': '' })], -400);
  const now = await one(p);
  expect(now).toMatchObject({ flowState: 'emdad_arrived', emdadQuantityReview: true, reservedQuantity: 0, outstandingQuantity: 1, emdad: { arrived: true, receivedAt: '2026-11-13T05:45:00.000Z' } });
  expect(now.allowedActions).not.toContain('hand_over');
  expect(now.emdadReserveNote).toContain('تعداد اختصاصي');
  expect((await parts.post(`/parts/${p.id}/flow`, { expectedVersion: now.version, action: 'reserve', snapshotId, fullStockCode: '0012345602', locationAddress: 'A-02' })).body.code).toBe('EMDAD_QUANTITY_UNVERIFIED');
  const prof = await owner.get('/daily-reports/profiles/emdad');
  expect(prof.body.settings.receivedQuantityField).toBe('specialQuantity');
  expect((await owner.patch('/daily-reports/profiles/emdad', { expectedVersion: prof.body.version, receivedQuantityField: 'supplyQuantity' })).body.code).toBe('EMDAD_QUANTITY_COLUMN_FIXED');
  await publish([row(10, c, '00123456', { ...arrival, 'تعداد اختصاصي': '۱' })], -360);
  expect(await one(p)).toMatchObject({ flowState: 'reserved', emdadQuantityReview: false, reservedQuantity: 1 });
});

it('registers special aid by «شمارهٔ امداد ویژه» (optional), validates codes by field and never asks for a request number', async () => {
  const c = await newCase('930001');
  const raw = await expert.post(`/cases/${c.id}/parts`, { description: 'آزمون کد', partNumber: '00123456', quantity: 1, source: 'company' });
  const base = { expectedVersion: raw.body.version, action: 'emdad' };
  expect((await parts.post(`/parts/${raw.body.id}/flow`, { ...base, requestedCode: '9912345602' })).body.code).toBe('SPECIAL_AID_CODE_INVALID');
  expect((await parts.post(`/parts/${raw.body.id}/flow`, { ...base, emdadNo: 'ABC' })).status).toBe(400);
  const ok = await parts.post(`/parts/${raw.body.id}/flow`, { ...base, emdadNo: '۰۰۷۰۰۰۹', requestedCode: '0012345602' });
  expect(ok.status).toBe(201);
  expect(ok.body).toMatchObject({ flowState: 'emdad', emdadNo: '0070009', orderRef: null, assessmentCode: '00123456', procurementCode: '0012345602', displayCode: '0012345602' });
  // A market code keeps letters and every character.
  const market = await expert.post(`/cases/${c.id}/parts`, { description: 'قطعهٔ بازار', partNumber: 'AB-1234567890X', quantity: 1, source: 'external' });
  expect(market.body).toMatchObject({ partNumber: 'AB-1234567890X', assessmentCode: null, procurementCode: null });
});

it('shows each pre-arrival stage, fills the number once, then reserves the exact procurement code on arrival with the real receipt date', async () => {
  const c = await newCase('930002');
  const p = await companyPart(c, '00123456');
  // A legacy request number on the line stays untouched and is never copied into the special-aid number.
  await h.db.db.update(partRequests).set({ orderRef: 'LEGACY-REQ-77' }).where(eq(partRequests.id, p.id));

  const first = await publish([row(1, c, '00123456', { 'شماره امداد ویژه': '0070001', 'كد تداركاتي كالا': '0012345602', 'وضعیت امداد ویژه': 'در مرحله خرید' })], -240);
  expect(first.counts.emdadNoFilled).toBe(1);
  let now = await one(p);
  expect(now).toMatchObject({ flowState: 'emdad', emdadNo: '0070001', orderRef: 'LEGACY-REQ-77', emdad: { statusText: 'در مرحله خرید', arrived: false, receivedAt: null } });

  await publish([row(1, c, '00123456', { 'شماره امداد ویژه': '0070001', 'كد تداركاتي كالا': '0012345602', 'وضعیت امداد ویژه': 'در حال تامین' })], -200);
  expect((await one(p)).emdad).toMatchObject({ statusText: 'در حال تامین', arrived: false });

  const arrival = row(1, c, '00123456', { 'شماره امداد ویژه': '0070001', 'كد تداركاتي كالا': '0012345602', 'وضعیت امداد ویژه': 'وارد موجودی شده است', 'تاريخ رسيد شدن امداد ويژه در انبار': '1405/08/20', 'تعداد تداركاتي': '1' });
  const arrived = await publish([arrival], -160);
  expect(arrived.counts).toMatchObject({ partsArrived: 1, partsReserved: 1 });
  now = await one(p);
  expect(now).toMatchObject({
    flowState: 'reserved', procurementCode: '0012345602', displayCode: '0012345602', assessmentCode: '00123456',
    emdadReceivedAt: '2026-11-10T20:30:00.000Z', reservedQuantity: 1, outstandingQuantity: 0, orderRef: 'LEGACY-REQ-77',
    emdad: { arrived: true, receivedAt: '2026-11-10T20:30:00.000Z' },
  });
  // The receipt date is the warehouse column, not the report date.
  expect(now.emdad!.reportAt).not.toBe(now.emdadReceivedAt);
  expect((await reservationsOf(p.id)).map((r) => [r.fullStockCode, Number(r.quantity), r.status])).toEqual([['0012345602', 1, 'reserved']]);

  // The same arrival again (overlapping file) and twice at the same time: no second reservation or movement.
  const [a, b] = await Promise.all([preview('emdad', buildEmdadXml([arrival])), preview('emdad', buildEmdadXml([arrival, row(9, c, '00999999')]))]);
  await Promise.all([apply(a, -120), apply(b, -110)]);
  await publish([arrival], -100);
  expect(await reservationsOf(p.id)).toHaveLength(1);
  expect(await h.db.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, p.id), eq(auditEvents.action, 'stock.reserved')))).toHaveLength(1);

  // The parts clerk keeps the delivery action.
  const delivered = await parts.post(`/parts/${p.id}/flow`, { expectedVersion: now.version, action: 'hand_over', recipientName: 'تکنسین آزمون' });
  expect(delivered.status).toBe(201);
  expect(delivered.body).toMatchObject({ flowState: 'handed_over' });
  expect((await reservationsOf(p.id))[0]).toMatchObject({ status: 'issued' });
});

it('«رسید توسط نمایندگی» with a partial receipt reserves only what was confirmed, shows no date without one, and completes later', async () => {
  const c = await newCase('930003');
  const p = await companyPart(c, '00998877', 3, '0070003');
  await publish([row(3, c, '00998877', { 'شماره امداد ویژه': '0070003', 'كد تداركاتي كالا': '0099887701', 'وضعیت امداد ویژه': 'رسید توسط نمایندگی', 'تعداد اختصاصي': '2', 'تاريخ رسيد شدن امداد ويژه در انبار': '' })], -90);
  let now = await one(p);
  expect(now).toMatchObject({ flowState: 'emdad_arrived', reservedQuantity: 2, outstandingQuantity: 1, emdadReceivedAt: null, emdad: { arrived: true, receivedAt: null } });
  expect(now.emdadReserveNote).toContain('2 از 3');
  // Ready for delivery only when the whole quantity is reserved.
  expect(now.allowedActions).not.toContain('hand_over');
  await publish([row(3, c, '00998877', { 'شماره امداد ویژه': '0070003', 'كد تداركاتي كالا': '0099887701', 'وضعیت امداد ویژه': 'رسید توسط نمایندگی', 'تعداد اختصاصي': '3' })], -80);
  now = await one(p);
  expect(now).toMatchObject({ flowState: 'reserved', reservedQuantity: 3, outstandingQuantity: 0, emdadReserveNote: null });
  expect((await reservationsOf(p.id)).reduce((n, r) => n + Number(r.quantity), 0)).toBe(3);
});

it('without a procurement code the clerk chooses among the manufacturer variants; the choice is reserved and recorded, and other cases cannot take it', async () => {
  const c = await newCase('930004');
  const p = await companyPart(c, '00123456', 1, '0070004');
  await publish([row(4, c, '00123456', { 'شماره امداد ویژه': '0070004', 'كد تداركاتي كالا': '', 'وضعیت امداد ویژه': 'وارد موجودی شده است', 'تاريخ رسيد شدن امداد ويژه در انبار': '1405/08/21' })], -70);
  const now = await one(p);
  expect(now).toMatchObject({ flowState: 'emdad_arrived', allowedActions: expect.arrayContaining(['reserve', 'cancel']), reservedQuantity: 0 });
  expect(now.emdadReserveNote).toContain('کد تدارکاتی ۱۰ رقمی');
  const options = (await parts.get('/stock/options?base=00123456')).body.items as { fullStockCode: string; available: string; salePrice: string | null }[];
  expect(options.map((o) => [o.fullStockCode, o.available, o.salePrice])).toEqual([['0012345601', '1', '1500'], ['0012345602', '3', '1800']]);
  expect((await parts.post(`/parts/${p.id}/flow`, { expectedVersion: now.version, action: 'reserve', snapshotId, fullStockCode: '0099887701', locationAddress: 'B-01' })).body.code).toBe('PROCUREMENT_CODE_MISMATCH');
  const chosen = await parts.post(`/parts/${p.id}/flow`, { expectedVersion: now.version, action: 'reserve', snapshotId, fullStockCode: '0012345601', locationAddress: 'A-01' });
  expect(chosen.status).toBe(201);
  expect(chosen.body).toMatchObject({ flowState: 'reserved', procurementCode: '0012345601', displayCode: '0012345601', reservedQuantity: 1 });
  expect(await h.db.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, p.id), eq(auditEvents.action, 'part.variant_selected')))).toHaveLength(1);
  // The reserved unit is not available to another vehicle.
  const other = await newCase('930005');
  const q = await expert.post(`/cases/${other.id}/parts`, { description: 'نیاز دیگر', partNumber: '00123456', quantity: 1, source: 'stock' });
  expect((await parts.post(`/parts/${q.body.id}/flow`, { expectedVersion: q.body.version, action: 'reserve', snapshotId, fullStockCode: '0012345601', locationAddress: 'A-01' })).body.code).toBe('INSUFFICIENT_STOCK');
});

it('explains insufficient stock, keeps the line outstanding, and sends a conflicting special-aid number to review', async () => {
  const c = await newCase('930006');
  const short = await companyPart(c, '00555555', 1, '0070006');
  await publish([row(6, c, '00555555', { 'شماره امداد ویژه': '0070006', 'كد تداركاتي كالا': '0055555501', 'وضعیت امداد ویژه': 'وارد موجودی شده است' })], -60);
  const now = await one(short);
  expect(now).toMatchObject({ flowState: 'emdad_arrived', outstandingQuantity: 1, procurementCode: '0055555501' });
  expect(now.emdadReserveNote).toContain('کافی نیست');
  expect(await reservationsOf(short.id)).toHaveLength(0);

  const conflict = await companyPart(c, '00443322', 1, '0070999');
  await publish([row(7, c, '00443322', { 'شماره امداد ویژه': '0070007', 'كد تداركاتي كالا': '0044332201', 'وضعیت امداد ویژه': 'وارد موجودی شده است' })], -50);
  expect(await one(conflict)).toMatchObject({ flowState: 'emdad', emdadNo: '0070999', emdad: null });
  const [req] = await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.emdadNo, '0070007'));
  expect(req).toMatchObject({ partRequestId: null, matchStatus: 'needs_review' });
  expect(await reservationsOf(conflict.id)).toHaveLength(0);
  // The other parts of this case were not touched by the conflict.
  expect((await h.db.db.select().from(stockReservations).where(inArray(stockReservations.partRequestId, [short.id, conflict.id])))).toHaveLength(0);
});


it('replays retained reports after late VIN entry, keeps receipt dates independent and repeated edits do not duplicate reservations', async () => {
  const c = await newCase('939901');
  const vin = c.vehicle.vin!;
  const blank = await expert.patch(`/cases/${c.id}`, { expectedVersion: c.version, vehicle: { vin: null } });
  expect(blank.status).toBe(200);
  const p = await companyPart(blank.body, '00776655', 1, '0099001');
  await publish([row(9901, c, '00776655', { 'شماره امداد ویژه': '0099001', 'كد تداركاتي كالا': '0077665501', 'وضعیت امداد ویژه': 'رسید توسط نمایندگی', 'تاريخ رسيد شدن امداد ويژه در انبار': '1405/08/20', 'تعداد تداركاتي': '1' })], -90);
  expect(await reservationsOf(p.id)).toHaveLength(0);
  const [before] = await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.emdadNo, '0099001'));
  expect(before.partRequestId).toBeNull();
  expect(await h.db.db.select().from(dailyReportFiles).where(eq(dailyReportFiles.importId, before.lastImportId))).toHaveLength(1);
  const update = await expert.patch(`/cases/${c.id}`, { expectedVersion: blank.body.version, vehicle: { vin } });
  expect(update.status).toBe(200);
  expect(await one(p)).toMatchObject({ flowState: 'emdad_arrived', reservedQuantity: 0, emdad: { receivedAt: '2026-11-10T20:30:00.000Z' } });
  // Completing case identity does not grant the expert stock-reservation permission.
  expect((await one(p)).emdadReserveNote).toContain('اجازهٔ رزرو');
  const [after] = await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.id, before.id));
  expect(after.lastReportAt).toEqual(before.lastReportAt);
  expect(after.lastImportId).toBe(before.lastImportId);
  expect(after.partRequestId).toBe(p.id);
  const authorized = await h.loginAs('rematch-authorized', ['accident_expert'], ['stock.reserve']);
  expect((await authorized.patch(`/cases/${c.id}`, { expectedVersion: update.body.version, vehicle: { vin } })).status).toBe(200);
  const fresh = (await expert.get(`/cases/${c.id}`)).body;
  expect((await authorized.patch(`/cases/${c.id}`, { expectedVersion: fresh.version, vehicle: { vin } })).status).toBe(200);
  expect(await one(p)).toMatchObject({ flowState: 'reserved', reservedQuantity: 1 });
  const latest = (await expert.get(`/cases/${c.id}`)).body;
  const edits = await Promise.all([1, 2].map(() => authorized.patch(`/cases/${c.id}`, { expectedVersion: latest.version, vehicle: { vin } })));
  expect(edits.map(e => e.status).sort()).toEqual([200, 409]);
  expect(await reservationsOf(p.id)).toHaveLength(1);
  const audits = await h.db.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, before.id), eq(auditEvents.action, 'emdad.auto_rematched')));
  expect(audits.length).toBeGreaterThan(0);
});

it('a part added after a report is linked without another upload; later report stages stay current', async () => {
  const c = await newCase('939902');
  await publish([row(9902, c, '00887766', { 'شماره امداد ویژه': '0099002', 'كد تداركاتي كالا': '0088776601', 'وضعیت امداد ویژه': 'در حال تامین' })], -80);
  const p = await companyPart(c, '00887766', 1, '0099002');
  const [linked] = await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.emdadNo, '0099002'));
  expect(linked.partRequestId).toBe(p.id);
  expect(linked.matchStatus).toBe('matched');
  expect((await one(p)).emdad?.arrived).toBe(false);
  const fresh = (await expert.get(`/cases/${c.id}`)).body;
  expect((await expert.patch(`/cases/${c.id}`, { expectedVersion: fresh.version, vehicle: { vin: 'TESTVIN99900990022' } })).status).toBe(200);
  const [review] = await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.id, linked.id));
  expect(review).toMatchObject({ matchStatus: 'needs_review', partRequestId: null });
});


it('preserves a manual no-link decision during identifier edits and retains applied source bytes beyond upload expiry', async () => {
  const c = await newCase('939903');
  const p = await companyPart(c, '00665544', 1, '0099003');
  await publish([row(9903, c, '00665544', { 'شماره امداد ویژه': '0099003', 'كد تداركاتي كالا': '0066554401', 'وضعیت امداد ویژه': 'در حال تامین' })], -70);
  const [r] = await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.emdadNo, '0099003'));
  const review = await parts.post(`/emdad/requests/${r.id}/match`, { expectedVersion: r.version, caseId: null, partRequestId: null, note: 'تصمیم دستی آزمون: متصل نشود' });
  expect(review.status).toBe(201);
  const fresh = (await expert.get(`/cases/${c.id}`)).body;
  expect((await expert.patch(`/cases/${c.id}`, { expectedVersion: fresh.version, vehicle: { vin: c.vehicle.vin } })).status).toBe(200);
  const [after] = await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.id, r.id));
  expect(after).toMatchObject({ matchSource: 'manual', partRequestId: null, caseId: null, version: r.version + 1 });
  expect(await reservationsOf(p.id)).toHaveLength(0);
  await h.app.get(DailyReportsService).recover(new Date(Date.now() + 8 * 86400_000));
  expect(await h.db.db.select().from(dailyReportFiles).where(eq(dailyReportFiles.importId, r.lastImportId))).toHaveLength(1);
});


it('reserves all special units beyond the initial line quantity and gives the clerk control of each handover', async () => {
  const c = await newCase('939904');
  const p = await companyPart(c, '00558877', 1, '0099004');
  await publish([row(9904, c, '00558877', { 'شماره امداد ویژه': '0099004', 'كد تداركاتي كالا': '0055887702', 'وضعیت امداد ویژه': 'رسید توسط نمایندگی', 'تعداد اختصاصي': '3', 'تعداد تداركاتي': '8' })], -35);
  const ready = await one(p);
  expect(ready).toMatchObject({ quantity: 3, reservedQuantity: 3, handedOverQuantity: 0, deliverableQuantity: 3, flowState: 'reserved' });
  const handover = (version: number, deliveryQuantity: number, recipientName: string) => parts.post(`/parts/${p.id}/flow`, { action: 'hand_over', expectedVersion: version, deliveryQuantity, recipientName });
  expect((await handover(ready.version, 4, 'کارگاه آزمون')).body.code).toBe('DELIVERY_QUANTITY_INVALID');
  const first = await handover(ready.version, 2, 'کارگاه آزمون یک');
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({ quantity: 3, handedOverQuantity: 2, deliverableQuantity: 1, flowState: 'reserved' });
  const held = await reservationsOf(p.id);
  expect(held.map(r => [r.status, Number(r.quantity)]).sort()).toEqual([['issued', 2], ['reserved', 1]]);
  expect((await handover(ready.version, 1, 'کارگاه آزمون')).status).toBe(409);
  expect((await handover(first.body.version, 2, 'کارگاه آزمون')).body.code).toBe('DELIVERY_QUANTITY_INVALID');
  const last = await handover(first.body.version, 1, 'کارگاه آزمون دو');
  expect(last.status).toBe(201);
  expect(last.body).toMatchObject({ handedOverQuantity: 3, deliverableQuantity: 0, flowState: 'handed_over' });
  const events = await h.db.db.select().from(auditEvents).where(and(eq(auditEvents.entityId, p.id), eq(auditEvents.action, 'part.handed_over')));
  expect(events).toHaveLength(2);
});

it('uses the sole live replacement of an explicitly cancelled SKU with the same chassis and assessment code', async () => {
  const c = await newCase('939905');
  const p = await companyPart(c, '00334455', 1, '0099005');
  const ordered = await parts.post(`/parts/${p.id}/flow`, { action: 'set_price', expectedVersion: p.version, saleUnitRial: 100 });
  expect(ordered.status).toBe(201);
  const old = { 'شماره امداد ویژه': '0099005', 'كد تداركاتي كالا': '0033445501', 'وضعیت امداد ویژه': 'ابطال', 'تعداد اختصاصي': '4' };
  const next = { 'شماره امداد ویژه': '0099006', 'كد تداركاتي كالا': '0033445502', 'وضعیت امداد ویژه': 'رسید توسط نمایندگی', 'تعداد اختصاصي': '2' };
  await publish([row(9905, c, '00334455', old)], -38);
  expect((await one(p)).emdad?.category).toBe('cancelled');
  await publish([row(9906, c, '00334455', next), row(9905, c, '00334455', old)], -36);
  expect(await one(p)).toMatchObject({ emdadNo: '0099006', procurementCode: '0033445502', reservedQuantity: 2, emdad: { category: 'received_by_dealer', history: expect.arrayContaining([expect.objectContaining({ statusText: 'ابطال' })]) } });
  expect((await reservationsOf(p.id)).map(r => [r.fullStockCode, Number(r.quantity)])).toEqual([['0033445502', 2]]);
  await publish([row(9905, c, '00334455', old)], -32);
  expect((await one(p)).emdad?.category).toBe('received_by_dealer');
});


it('preserves both manufacturer variants when the report repeats the same special-aid number', async () => {
  const c = await newCase('939906');
  const need = await expert.post(`/cases/${c.id}/parts`, { description: 'قطعه جایگزین آزمون', partNumber: '00558877', quantity: 1, source: 'company' });
  const reg = await parts.post(`/parts/${need.body.id}/flow`, { expectedVersion: need.body.version, action: 'emdad', emdadNo: '0099010', requestedCode: '0055887701' });
  expect(reg.status).toBe(201);
  const old = row(9910, c, '00558877', { 'شماره امداد ویژه': '0099010', 'كد تداركاتي كالا': '0055887701', 'وضعیت امداد ویژه': 'ابطال' });
  const replacement = row(9911, c, '00558877', { 'شماره امداد ویژه': '0099010', 'كد تداركاتي كالا': '0055887702', 'وضعیت امداد ویژه': 'رسید توسط نمایندگی', 'تعداد اختصاصي': '2' });
  await publish([replacement, old], -25);
  expect(await one(reg.body)).toMatchObject({ emdadNo: '0099010', procurementCode: '0055887702', reservedQuantity: 2, emdad: { category: 'received_by_dealer' } });
  await publish([old], -24);
  expect(await one(reg.body)).toMatchObject({ procurementCode: '0055887702', reservedQuantity: 2, emdad: { category: 'received_by_dealer' } });
  expect(await reservationsOf(reg.body.id)).toHaveLength(1);
});

it('leaves competing replacements for review instead of picking the first SKU', async () => {
  const c = await newCase('939907');
  const p = await companyPart(c, '00334455', 1, '0099020');
  const variant = (id: number, suffix: string, status: string) => row(id, c, '00334455', { 'شماره امداد ویژه': `00990${id}`, 'كد تداركاتي كالا': `00334455${suffix}`, 'وضعیت امداد ویژه': status, 'تعداد اختصاصي': '1' });
  await publish([variant(20, '01', 'ابطال'), variant(21, '02', 'رسید توسط نمایندگی'), variant(22, '03', 'در حال تامین')], -20);
  expect(await one(p)).toMatchObject({ emdadNo: '0099020', procurementCode: null, emdad: { category: 'cancelled' } });
  expect(await reservationsOf(p.id)).toHaveLength(0);
  const candidates = await h.db.db.select().from(emdadRequests).where(inArray(emdadRequests.emdadNo, ['0099021', '0099022']));
  expect(candidates.map(r => r.matchStatus)).toEqual(['needs_review', 'needs_review']);
});
