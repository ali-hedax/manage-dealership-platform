import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { formatJalaliDateInput, formatTimeInput, type CaseDetail, type DailyImport, type Part } from '@manage/shared';
import { cases, emdadRequestEvents, emdadRequests, notifications, partPriceNotices, partRequests, stockReservations, users, vehicles } from '../src/db/schema';
import { buildEmdadXml, emdadRow } from '../src/daily-reports/fixtures';
import { Client, createHarness, daysAgo, type Harness } from './harness';

// Unified parts list (spec section 7): one list per vehicle, the state machine
// enforced on the server, Emdad Vijeh reports moving lines automatically.
let h: Harness;
let expert: Client;
let parts: Client;
let admin: Client;

const flow = (p: Pick<Part, 'id' | 'version'>, body: object, c = parts) => c.post(`/parts/${p.id}/flow`, { expectedVersion: p.version, ...body });
const partsOf = async (caseId: string): Promise<Part[]> => (await expert.get(`/cases/${caseId}/parts`)).body;
const one = async (p: Pick<Part, 'id' | 'caseId'>) => (await partsOf(p.caseId)).find((x) => x.id === p.id)!;

async function newCase(admissionNo: string, coverageType = 'personal'): Promise<CaseDetail> {
  const res = await expert.post('/cases', {
    customer: { fullName: 'مشتری آزمون قطعات', phone: '09000007777' },
    vehicle: { brand: 'ایران‌خودرو', model: 'ریرا', vin: `TESTVIN${Math.random().toString().slice(2, 12)}` },
    admissionNo,
    admittedAt: daysAgo(2),
    coverageType,
    damageDescription: 'آزمون فهرست واحد قطعات',
  });
  expect(res.status).toBe(201);
  return res.body;
}
async function newPart(caseId: string, partNumber: string | null, quantity = 1, description = 'گلگیر جلو آزمون'): Promise<Part> {
  const res = await expert.post(`/cases/${caseId}/parts`, { description, partNumber, quantity, source: 'company' });
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  h = await createHarness();
  [expert, parts, admin] = await Promise.all(['expert', 'parts', 'admin'].map((u) => h.login(u)));
});
afterAll(async () => {
  await h?.close();
});

describe('state machine on the server', () => {
  it('offers only the actions of the current state and refuses every other one in Persian', async () => {
    const c = await newCase('940001');
    let p = await newPart(c.id, '11112222');
    expect(p).toMatchObject({ flowState: 'needed', allowedActions: ['reserve', 'emdad', 'market', 'cancel', 'set_price', 'announce_price'] });
    const refused = await flow(p, { action: 'hand_over', recipientName: 'تکنسین آزمون' });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('PART_ACTION_NOT_ALLOWED');
    expect(refused.body.message).toContain('تعیین تکلیف نشده');
    // The accident expert adds needs and reads supply; changing it is the parts clerk's work.
    expect((await flow(p, { action: 'emdad', emdadNo: '7001' }, expert)).status).toBe(403);
    // «شمارهٔ امداد ویژه» is digits only (and optional); a cancellation needs a reason.
    expect((await flow(p, { action: 'emdad', emdadNo: 'REQ-1' })).status).toBe(400);
    expect((await flow(p, { action: 'cancel', reason: '' })).status).toBe(400);

    p = (await flow(p, { action: 'emdad', emdadNo: '4027713501', requestedCode: '1111222201' })).body;
    expect(p).toMatchObject({ flowState: 'emdad', emdadNo: '4027713501', orderRef: null, procurementCode: '1111222201', allowedActions: ['cancel', 'set_price', 'announce_price'] });
    // Status changes only through the daily report: no manual receipt.
    expect((await flow(p, { action: 'receive' })).body.code).toBe('PART_ACTION_NOT_ALLOWED');
    expect((await flow(p, { expectedVersion: p.version - 1, action: 'cancel', reason: 'نسخهٔ قدیمی' })).status).toBe(409);
    p = (await flow(p, { action: 'cancel', reason: 'خودرو با قطعهٔ شرکت دیگر تعمیر شد' })).body;
    expect(p).toMatchObject({ flowState: 'cancelled', allowedActions: [], cancelReason: 'خودرو با قطعهٔ شرکت دیگر تعمیر شد' });
    // Cancelled lines leave the active list but stay in history.
    expect((await partsOf(c.id)).map((x) => x.id)).toContain(p.id);
  });

  it('market purchase: receipt makes it ready, handover delivers it, a return keeps the reason', async () => {
    const c = await newCase('940002');
    let p = await newPart(c.id, '33334444');
    p = (await flow(p, { action: 'market', supplier: 'فروشگاه آزمون', purchaseUnitRial: 9_000_000, saleUnitRial: 11_000_000 })).body;
    expect(p).toMatchObject({ flowState: 'market', supplier: 'فروشگاه آزمون', unitPriceRial: 9_000_000, salePriceRial: 11_000_000 });
    expect((await flow(p, { action: 'hand_over', recipientName: 'تکنسین آزمون' })).body.code).toBe('PART_ACTION_NOT_ALLOWED');
    p = (await flow(p, { action: 'receive', receiptDocNo: 'RCV-TEST-1' })).body;
    expect(p).toMatchObject({ flowState: 'ready', allowedActions: ['hand_over', 'cancel', 'set_price', 'announce_price'] });
    p = (await flow(p, { action: 'hand_over', recipientName: 'تکنسین آزمون' })).body;
    expect(p).toMatchObject({ flowState: 'handed_over', recipientName: 'تکنسین آزمون', allowedActions: ['return', 'set_price', 'announce_price'] });
    p = (await flow(p, { action: 'return', reason: 'قطعه با خودرو نخواند' })).body;
    expect(p).toMatchObject({ flowState: 'returned', returnReason: 'قطعه با خودرو نخواند', allowedActions: [] });
  });

  it('the same technical code never makes a second row: an undecided line grows, a decided one refuses', async () => {
    const c = await newCase('940003');
    const p = await newPart(c.id, '5555-6666', 1);
    const again = await expert.post(`/cases/${c.id}/parts`, { description: 'همان قطعه', partNumber: '۵۵۵۵۶۶۶۶', quantity: 2, source: 'company' });
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ id: p.id, quantity: 3 });
    expect(await partsOf(c.id)).toHaveLength(1);
    await flow(await one(p), { action: 'emdad', emdadNo: '4027713502' });
    const third = await expert.post(`/cases/${c.id}/parts`, { description: 'همان قطعه', partNumber: '55556666', quantity: 1, source: 'company' });
    expect(third.body.code).toBe('DUPLICATE_PART_CODE');
    expect(await partsOf(c.id)).toHaveLength(1);
  });
});

describe('price: free and silent, «اعلام قیمت» only on purpose', () => {
  it('records announcements, lets the expert answer once and never blocks the line', async () => {
    const c = await newCase('940004');
    let p = await newPart(c.id, '77778888');
    p = (await flow(p, { action: 'set_price', saleUnitRial: 2_000_000 })).body;
    expect(p).toMatchObject({ salePriceRial: 2_000_000, priceNotice: null });
    expect(await h.db.db.select().from(partPriceNotices).where(eq(partPriceNotices.partRequestId, p.id))).toHaveLength(0);

    p = (await flow(p, { action: 'announce_price', saleUnitRial: 2_400_000, note: 'قیمت بازار بالا رفت' })).body;
    expect(p.priceNotice).toMatchObject({ saleUnitRial: 2_400_000, note: 'قیمت بازار بالا رفت', response: null });
    const open = (await expert.get(`/price-notices?caseId=${c.id}`)).body;
    expect(open).toEqual([expect.objectContaining({ id: p.priceNotice!.id, part: expect.objectContaining({ id: p.id }) })]);
    // Work continues while nobody answers.
    p = (await flow(p, { action: 'market', supplier: 'بازار آزمون', purchaseUnitRial: 2_000_000, saleUnitRial: 2_400_000 })).body;
    expect(p.flowState).toBe('market');

    expect((await parts.post(`/price-notices/${p.priceNotice!.id}/respond`, { expectedVersion: 1, response: 'approved' })).status).toBe(403);
    expect((await expert.post(`/price-notices/${p.priceNotice!.id}/respond`, { expectedVersion: 1, response: 'instruction' })).status).toBe(400);
    const answered = await expert.post(`/price-notices/${p.priceNotice!.id}/respond`, { expectedVersion: 1, response: 'instruction', instruction: 'از فروشگاه آزمون دوم بخرید' });
    expect(answered.status).toBe(201);
    expect(answered.body).toMatchObject({ response: 'instruction', instruction: 'از فروشگاه آزمون دوم بخرید' });
    expect((await expert.post(`/price-notices/${p.priceNotice!.id}/respond`, { expectedVersion: 2, response: 'approved' })).body.code).toBe('PRICE_NOTICE_CLOSED');
    const [clerk] = await h.db.db.select({ id: users.id }).from(users).where(eq(users.username, 'parts'));
    const told = await h.db.db.select().from(notifications).where(and(eq(notifications.userId, clerk!.id), eq(notifications.kind, 'price_notice_answer')));
    expect(told).toHaveLength(1);
    expect((await one(p)).priceNotice).toBeNull();
  });
});

describe('daily Emdad report moves the line automatically', () => {
  const soon = (min: number) => {
    const d = new Date(Date.now() + min * 60_000);
    return { reportDate: formatJalaliDateInput(d), reportTime: formatTimeInput(d) };
  };
  async function publish(rows: ReturnType<typeof emdadRow>[], min: number) {
    const u = await request(h.app.getHttpServer())
      .post('/api/v1/daily-reports/uploads?kind=emdad&fileName=synthetic.xls')
      .set('Cookie', admin.cookie)
      .set('x-manage-client', 'test')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.from(buildEmdadXml(rows)));
    expect(u.status).toBe(201);
    let job: DailyImport = u.body;
    for (let i = 0; i < 300 && ['uploaded', 'parsing'].includes(job.status); i++) {
      await new Promise((r) => setTimeout(r, 50));
      job = (await admin.get(`/daily-reports/imports/${u.body.id}`)).body;
    }
    const applied = await admin.post(`/daily-reports/imports/${job.id}/apply`, { declaration: true, declaredToday: true, ...soon(min) });
    expect(applied.status).toBe(201);
    return applied.body;
  }

  const vinOf = async (caseId: string) => (await h.db.db.select({ vin: vehicles.vin }).from(vehicles).innerJoin(cases, eq(cases.vehicleId, vehicles.id)).where(eq(cases.id, caseId)))[0]!.vin!;
  // Report rows here never match by admission (X-…): only the special-aid number or VIN + assessment code can link them.
  const row = (i: number, code: string, status = 'در حال تامین', chassis = '', emdadNo = '', requestNo = '') =>
    emdadRow(i, { 'شماره کارت پذيرش': `X-AID-${i}`, 'شماره امداد ویژه': emdadNo, 'شماره درخواست': requestNo, 'کد قطعه': code, 'کد اختصاصی اولیه': code, 'كد تداركاتي كالا': `${code}01`, 'شماره شاسی': chassis, 'وضعیت امداد ویژه': status });
  const requestOf = async (partId: string) => (await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.partRequestId, partId)))[0];

  it('links by VIN + assessment code, fills the special-aid number, keeps an arrival outstanding without stock, and «تأمین توسط نمایندگی» tells the clerk', async () => {
    const c = await newCase('950041');
    const vin = await vinOf(c.id);
    let arrived = await newPart(c.id, '12345641', 1, 'سپر جلو آزمون');
    let dealer = await newPart(c.id, '12345642', 1, 'چراغ جلو آزمون');
    arrived = (await flow(arrived, { action: 'emdad' })).body;
    dealer = (await flow(dealer, { action: 'emdad', emdadNo: '500042' })).body;

    const result = await publish([
      row(41, '12345641', 'وارد موجودی شده است', vin, '500041'),
      row(42, '12345642', 'تامین توسط نمایندگی', '', '500042'),
    ], 1);
    expect(result.counts).toMatchObject({ partsArrived: 1, partsDealerSupply: 1, emdadNoFilled: 1 });

    const now = await partsOf(c.id);
    const a = now.find((p) => p.id === arrived.id)!;
    // Receipt is not readiness: without a verified received quantity nothing is reserved and the quantity is flagged.
    expect(a).toMatchObject({ flowState: 'emdad_arrived', emdadNo: '500041', allowedActions: ['reserve', 'cancel', 'set_price', 'announce_price'] });
    expect(a.emdad).toMatchObject({ emdadNo: '500041', category: 'in_dealer_stock', statusText: 'وارد موجودی شده است', arrived: true });
    expect(a).toMatchObject({ emdadQuantityReview: true, reservedQuantity: 0 });
    expect(a.emdadReserveNote).toContain('تعداد رسیده تأیید نشده');
    const d = now.find((p) => p.id === dealer.id)!;
    expect(d).toMatchObject({ flowState: 'dealer_supply', allowedActions: ['market', 'reserve', 'set_price', 'announce_price'] });

    const [clerk] = await h.db.db.select({ id: users.id }).from(users).where(eq(users.username, 'parts'));
    expect(await h.db.db.select().from(notifications).where(and(eq(notifications.userId, clerk!.id), eq(notifications.kind, 'emdad_dealer_supply')))).toHaveLength(1);
    const bought = await flow(d, { action: 'market', supplier: 'بازار آزمون', purchaseUnitRial: 5_000_000, saleUnitRial: 6_000_000 });
    expect(bought.body).toMatchObject({ flowState: 'market', source: 'external' });

    const card = ((await parts.get('/parts/desk')).body as { caseId: string; counts: Record<string, number> }[]).find((x) => x.caseId === c.id)!;
    expect(card.counts).toMatchObject({ in_progress: 2 });
    expect((await expert.get('/parts/desk')).status).toBe(403);
    expect(await h.db.db.select().from(stockReservations).where(eq(stockReservations.partRequestId, arrived.id))).toHaveLength(0);
  });

  it('never matches on the legacy request number, keeps a conflicting stored number unchanged and matches historical lines by VIN + code', async () => {
    const c = await newCase('960101');
    const vin = await vinOf(c.id);
    const otherCase = await newCase('960102');
    const other = await newPart(otherCase.id, '77778891');
    await flow(other, { action: 'emdad', emdadNo: '610102' });
    // The other vehicle's line carries the same legacy request number as the report: still no link.
    await h.db.db.update(partRequests).set({ orderRef: '610101' }).where(eq(partRequests.id, other.id));
    const part = await newPart(c.id, '77778891');
    await flow(part, { action: 'emdad', emdadNo: '610199' });
    const historical = await newPart(c.id, '77778893');
    await h.db.db.update(partRequests).set({ status: 'ordered', source: 'company', orderRef: 'OLD-REQ-1' }).where(eq(partRequests.id, historical.id));

    await publish([row(101, '77778891', 'وارد موجودی شده است', vin, '610101', '610101'), row(103, '77778893', 'در حال تامین', vin, '610103')], -35);
    expect(await one(part)).toMatchObject({ flowState: 'emdad', emdadNo: '610199', emdad: null });
    expect(await one(historical)).toMatchObject({ emdadNo: '610103', orderRef: 'OLD-REQ-1', emdad: { emdadNo: '610103', statusText: 'در حال تامین' } });
    expect(await one(other)).toMatchObject({ flowState: 'emdad', emdad: null, emdadNo: '610102' });
    expect((await h.db.db.select().from(emdadRequests).where(eq(emdadRequests.emdadNo, '610101')))[0]).toMatchObject({ matchStatus: 'needs_review', partRequestId: null });
  });

  it('links by the special-aid number with leading zeros even without a chassis in the report', async () => {
    const c = await newCase('960051');
    const p1 = await newPart(c.id, '22223351', 1, 'درب جلو آزمون');
    await flow(p1, { action: 'emdad', emdadNo: '۰۵۶۰۰۵۱' });
    await publish([row(51, '22223351', 'در حال تامین', '', '0560051')], -55);
    expect((await one(p1)).emdad).toMatchObject({ emdadNo: '0560051', statusText: 'در حال تامین' });
    expect((await requestOf(p1.id))!.matchNote).toBe('شمارهٔ امداد ویژه و کد اختصاصی یکسان است');
  });

  it('records one history entry per status change across days, none for repeats or overlapping files, and shows the arrival', async () => {
    const c = await newCase('960081');
    const vin = await vinOf(c.id);
    let p = await newPart(c.id, '55556681', 1, 'کاپوت آزمون');
    p = (await flow(p, { action: 'emdad', emdadNo: '590081' })).body;
    await publish([row(81, '55556681', 'در حال تامین', vin, '590081')], -50);
    await publish([row(81, '55556681', 'در حال تامین', vin, '590081'), row(82, '12121282', 'در حال تامین', '', '590082')], -40);
    let now = await one(p);
    expect(now).toMatchObject({ flowState: 'emdad', allowedActions: ['cancel', 'set_price', 'announce_price'] });
    expect(now.emdad!.history).toEqual([{ at: expect.any(String), statusText: 'در حال تامین' }]);

    await publish([row(81, '55556681', 'وارد موجودی شده است', vin, '590081')], -30);
    await publish([row(81, '55556681', 'وارد موجودی شده است', vin, '590081'), row(83, '12121283', 'در حال تامین', '', '590083')], -20);
    now = await one(p);
    expect(now).toMatchObject({ flowState: 'emdad_arrived', emdad: { arrived: true } });
    expect(now.emdad!.history!.map((x) => x.statusText)).toEqual(['وارد موجودی شده است', 'در حال تامین']);
    const req = await requestOf(p.id);
    expect(await h.db.db.select().from(emdadRequestEvents).where(eq(emdadRequestEvents.requestId, req!.id))).toHaveLength(2);
  });
});
