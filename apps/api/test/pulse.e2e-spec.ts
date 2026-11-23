import { and, eq, sql } from 'drizzle-orm';
import type { PulseStatus, ReceptionDetail, ReceptionList } from '@manage/shared';
import { AuditService } from '../src/audit/audit.service';
import { newId } from '../src/common/ids';
import { APP_CONFIG, type AppConfig } from '../src/config';
import { auditEvents, cases, dailyReportImports, notifications, pulseConnections, receptionEvents, receptionParts, receptions, tenants, users, vehicles, workCalendars } from '../src/db/schema';
import { DailyReportsService } from '../src/daily-reports/daily-reports.service';
import { DEMO_TENANT_CODE } from '../src/demo/demo-seed.service';
import { KasbClient } from '../src/pulse/kasb-client';
import { PulseEngine } from '../src/pulse/pulse-engine';
import { jalaliDay, tehranDateKey, tehranMidnight } from '../src/pulse/pulse-map';
import { createHarness, type Client, type Harness } from './harness';
import { KasbMock, mockCardRow, mockPartRow, type MockCard } from './kasb-mock';

// Manage Pulse end to end against a synthetic «کسب‌وکار» (spec section 26): same encrypted
// protocol, keys generated in the test, invented data only (TESTVIN…, 0900…). The engine runs
// with its own clock at 10:00 Tehran today and a round-the-clock calendar, so the schedule does
// not depend on when CI runs.
// Synthetic, built at run time (not a credential): 44 characters for the ≥ 32 rule.
const SECRET = `test-only-pulse-${'k'.repeat(28)}`;
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic invoice image')]).toString('base64');

describe('Manage Pulse with the synthetic کسب‌وکار', () => {
  let h: Harness;
  let mock: KasbMock;
  let admin: Client;
  let expert: Client;
  let engine: PulseEngine;
  let tenantId = '';
  let shift = 0;
  const base = tehranMidnight(new Date()).getTime() + 10 * 3_600_000;
  const advance = (minutes: number) => { shift += minutes * 60_000; };
  const today = jalaliDay(new Date(base));
  const yesterday = jalaliDay(new Date(base - 86_400_000));
  const db = () => h.db.db;
  const status = async () => (await admin.get('/pulse/status').expect(200)).body as PulseStatus;
  const search = async (view: 'today' | 'open' | 'released', q?: string) => (await admin.post('/reception/search', { view, ...(q ? { q } : {}) }).expect(201)).body as ReceptionList;
  const receptionOf = async (rcd: number) => (await db().select().from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(receptions.kasbRcd, String(rcd)))))[0]!;
  const detail = async (rcd: number) => (await admin.get(`/reception/${(await receptionOf(rcd)).id}`).expect(200)).body as ReceptionDetail;
  const counts = async () => ({
    receptions: (await db().select({ n: sql<number>`count(*)::int` }).from(receptions))[0]!.n,
    parts: (await db().select({ n: sql<number>`count(*)::int` }).from(receptionParts))[0]!.n,
    events: (await db().select({ n: sql<number>`count(*)::int` }).from(receptionEvents))[0]!.n,
    audit: (await db().select({ n: sql<number>`count(*)::int` }).from(auditEvents).where(eq(auditEvents.entityType, 'reception')))[0]!.n,
    notices: (await db().select({ n: sql<number>`count(*)::int` }).from(notifications))[0]!.n,
  });
  const card = (n: number): MockCard => mock.cards.find((c) => c.row.DrcdRcd === 880000 + n)!;

  beforeAll(async () => {
    mock = new KasbMock();
    await mock.start();
    h = await createHarness({ withCases: true, config: { PULSE_ENABLED: 'true', PULSE_SECRET_KEY: SECRET, PULSE_KASB_ORIGIN: mock.url } });
    admin = await h.login('admin');
    expert = await h.login('expert');
    engine = new PulseEngine(h.db, h.app.get<AppConfig>(APP_CONFIG), h.app.get(AuditService), { now: () => new Date(base + shift), clientFactory: (origin) => new KasbClient({ origin, minGapMs: 0 }) });
    const [t] = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.code, DEMO_TENANT_CODE));
    tenantId = t!.id;
    const [adminUser] = await db().select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.username, 'admin')));
    const [{ v }] = (await db().select({ v: sql<number>`coalesce(max(${workCalendars.version}), 0)::int` }).from(workCalendars).where(eq(workCalendars.tenantId, tenantId))) as [{ v: number }];
    await db().insert(workCalendars).values({ id: newId(), tenantId, effectiveFrom: tehranDateKey(new Date(base)), calendar: { week: Array.from({ length: 7 }, () => [{ start: 0, end: 1439 }]), holidays: [], holidaysVerifiedThrough: null }, reason: 'آزمون منیج پالس: تقویم شبانه‌روزی', version: v + 1, createdBy: adminUser!.id, isTest: true });
  });
  afterAll(async () => {
    await h.close();
    await mock.stop();
  });

  it('is reachable only with its permissions; the module is active behind the server flag', async () => {
    await expert.get('/pulse/status').expect(403);
    await expert.post('/reception/search', { view: 'open' }).expect(403);
    await expert.put('/pulse/credentials', { expectedVersion: 0, dealerCode: '9999', username: 'x', password: 'y' }).expect(403);
    const me = (await admin.get('/auth/me').expect(200)).body as { permissions: string[]; modules: { key: string; status: string }[] };
    expect(me.permissions).toEqual(expect.arrayContaining(['integration.manage', 'reception.read', 'reception.external_work']));
    expect(me.modules.find((m) => m.key === 'reception')!.status).toBe('active');
    expect((await expert.get('/auth/me')).body.modules.find((m: { key: string }) => m.key === 'reception').status).toBe('active');
    expect((await expert.get('/auth/me')).body.permissions).not.toContain('reception.read');
    const s = await status();
    expect(s).toMatchObject({ featureEnabled: true, secretReady: true, configured: false, enabled: false, state: 'off' });
  });

  it('stores the password encrypted and never sends it back', async () => {
    const res = await admin.put('/pulse/credentials', { expectedVersion: 0, dealerCode: '۹۹۹۹', username: 'Test.User', password: mock.password }).expect(200);
    expect(JSON.stringify(res.body)).not.toContain(mock.password);
    expect(res.body).toMatchObject({ configured: true, hasPassword: true, dealerCode: '9999', username: 'Test.User', version: 1 });
    const [row] = await db().select().from(pulseConnections).where(eq(pulseConnections.tenantId, tenantId));
    expect(row!.passwordEnc!.startsWith('v1.')).toBe(true);
    expect(row!.passwordEnc).not.toContain(mock.password);
    const audit = await db().select().from(auditEvents).where(and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.entityType, 'pulse')));
    expect(JSON.stringify(audit)).not.toContain(mock.password);
    // Creating twice is a version conflict; saving without a password keeps the stored one.
    await admin.put('/pulse/credentials', { expectedVersion: 0, dealerCode: '9999', username: 'Test.User', password: 'other' }).expect(409);
    const kept = (await admin.put('/pulse/credentials', { expectedVersion: 1, dealerCode: '9999', username: 'Test.User' }).expect(200)).body as PulseStatus;
    expect(kept).toMatchObject({ hasPassword: true, version: 2 });
    await admin.put('/pulse/credentials', { expectedVersion: 2, dealerCode: 'abc', username: 'Test.User' }).expect(422);
    await admin.put('/pulse/settings', { expectedVersion: 2, intervalMinutes: 1, hoursMode: 'calendar', hoursFrom: '07:00', hoursTo: '19:00', openWindowDays: 60 }).expect(400);
    const saved = (await admin.put('/pulse/settings', { expectedVersion: 2, intervalMinutes: 3, hoursMode: 'calendar', hoursFrom: '07:00', hoursTo: '19:00', openWindowDays: 60 }).expect(200)).body as PulseStatus;
    expect(saved.settings.intervalMinutes).toBe(3);
  });

  it('«آزمایش اتصال» logs in once, reads once and stores nothing', async () => {
    mock.cards = [{ row: mockCardRow(1, { DrcdRcptDate: today }) }];
    await admin.post('/pulse/commands', { kind: 'test' }).expect(201);
    const queued = (await admin.post('/pulse/commands', { kind: 'test' }).expect(201)).body as PulseStatus;
    expect(queued.commands.filter((c) => c.kind === 'test' && c.status === 'pending')).toHaveLength(1);
    await engine.tick();
    const s = await status();
    expect(s.commands.find((c) => c.kind === 'test')).toMatchObject({ status: 'done', resultCode: 'OK' });
    expect(s.runs.find((r) => r.kind === 'test')).toMatchObject({ outcome: 'ok', read: 1 });
    expect(mock.loginAttempts).toBe(1);
    expect((await counts()).receptions).toBe(0);
  });

  let casesBefore: unknown[] = [];
  it('reads admissions, parts, labour and defects; links only a unique accident case', async () => {
    mock.cards = [
      { row: mockCardRow(1, { DrcdRcptDate: today }), parts: [mockPartRow(11), mockPartRow(12, { DrepDEmdadFlg: 1 })], repairs: [{ DrerRer: 21, DrerGrprRpr: '101', DrerDesc: 'تعویض سپر', DrerState: 'ثبت', DrerFinalPrice: 900000 }], defects: [{ DrefRef: 31, DrefCustomerExp: 'صدای جلوبندی', DrefExpertExp: 'بررسی شد', DrefState: 'باز' }] },
      { row: mockCardRow(2, { DrcdRcptDate: today }) },
      { row: mockCardRow(7, { DrcdRcptDate: yesterday, GchsVin: 'TESTVIN0000000077' }) },
    ];
    // Card 1: VIN of exactly one demo case. Card 2: its VIN belongs to one case and its admission
    // number to another, so it stays ambiguous and goes to review.
    const byVin = async (vin: string) => db().select({ id: cases.id, caseNumber: cases.caseNumber }).from(cases).innerJoin(vehicles, eq(vehicles.id, cases.vehicleId)).where(and(eq(cases.tenantId, tenantId), eq(vehicles.vin, vin)));
    const one = await byVin('TESTVIN0000000001');
    const two = await byVin('TESTVIN0000000002');
    expect(one).toHaveLength(1);
    expect(two).toHaveLength(1);
    const other = (await db().select({ id: cases.id }).from(cases).where(eq(cases.tenantId, tenantId))).find((c) => c.id !== one[0]!.id && c.id !== two[0]!.id)!;
    await db().update(cases).set({ admissionNo: '1405020002', admissionNoKey: '1405020002' }).where(eq(cases.id, other.id));
    casesBefore = await db().select().from(cases).where(eq(cases.tenantId, tenantId)).orderBy(cases.id);

    const s0 = await status();
    await admin.post('/pulse/start', { expectedVersion: s0.version }).expect(201);
    await engine.tick();

    expect((await counts()).receptions).toBe(3);
    expect((await search('open')).total).toBe(3);
    expect((await search('today')).total).toBe(2);
    expect((await search('open', '1405020001')).items.map((r) => r.admissionNo)).toEqual(['1405020001']);
    expect((await search('open', '12 ب 302')).total).toBe(1);
    expect((await search('open', 'TESTVIN0000000077')).total).toBe(1);
    const d = await detail(880001);
    expect(d.parts).toHaveLength(2);
    expect(d.parts.find((p) => p.lineId === '12')!.specialAid).toBe(true);
    expect(d.repairs[0]).toMatchObject({ code: '101', description: 'تعویض سپر', finalPriceRial: 900000 });
    expect(d.defects[0]).toMatchObject({ customerText: 'صدای جلوبندی' });
    expect(d).toMatchObject({ admissionNo: '1405020001', plate: '12 ب 301 67', statusText: 'در حال تعمیر', isOpen: true, linkState: 'linked', case: { id: one[0]!.id, caseNumber: one[0]!.caseNumber } });
    expect(d.customer).toMatchObject({ name: 'مشتری آزمایشی 1', mobile: '09000000001' });
    expect(d.vehicle).toMatchObject({ shortName: 'تارا', vin: 'TESTVIN0000000001', chassis: 'NAA10001', entranceKm: 12001 });
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['created', 'case_linked', 'part_added']));
    const list = await search('open');
    expect(list.items.find((r) => r.admissionNo === '1405020001')).toMatchObject({ partsCount: 2, caseNumber: one[0]!.caseNumber, vehicleName: 'تارا', daysIn: 1 });
    expect((await receptionOf(880002)).linkState).toBe('ambiguous');
    expect((await receptionOf(880007)).linkState).toBe('none');
    const review = (await admin.get('/pulse/review').expect(200)).body as { admissionNo: string; candidates: unknown[] }[];
    expect(review).toHaveLength(1);
    expect(review[0]!.candidates).toHaveLength(2);
    // Nothing in the accident cases changed.
    expect(await db().select().from(cases).where(eq(cases.tenantId, tenantId)).orderBy(cases.id)).toEqual(casesBefore);
    const s = await status();
    expect(s).toMatchObject({ enabled: true, state: 'active', todayReceptions: 2, reviewCount: 1 });
    expect(s.lastReadAt).not.toBeNull();
    expect(s.runs.map((r) => r.kind)).toEqual(expect.arrayContaining(['today', 'open', 'lines']));
  });

  it('reads the stock report once a day and stages it for confirmation, never applying it (owner, 2026-11-23)', async () => {
    const staged = async () => db().select({ id: dailyReportImports.id, status: dailyReportImports.status, diagnostics: dailyReportImports.diagnostics }).from(dailyReportImports).where(and(eq(dailyReportImports.tenantId, tenantId), eq(dailyReportImports.kind, 'stock')));
    // The first scheduled pass after 10:00 already read it from the parts warehouse.
    expect(mock.stockRequests.at(-1)).toMatchObject({ DssdSsd: '14553' });
    const first = await staged();
    expect(first).toHaveLength(1);
    expect(first[0]!.diagnostics).toMatchObject({ source: 'pulse' });
    // Not again the same day; «خواندن موجودی انبار» asks for it now, and the same file is not staged twice.
    const reads = mock.stockRequests.length;
    advance(4); await engine.tick();
    expect(mock.stockRequests.length).toBe(reads);
    await admin.post('/pulse/commands', { kind: 'stock_now' }).expect(201);
    await engine.tick();
    expect(mock.stockRequests.length).toBe(reads + 1);
    expect(await staged()).toHaveLength(1);
    // The API turns it into the usual preview; nothing is applied without a person.
    await h.app.get(DailyReportsService).processStaged();
    expect((await staged())[0]!.status).toBe('preview');
    expect((await status()).runs.some((r) => r.kind === 'stock' && r.outcome === 'ok')).toBe(true);
  });

  it('a repeated read of the same data creates no row, history, audit entry or notification', async () => {
    const before = await counts();
    const partsReads = mock.count('/api/Srv/rcpt/RepairCard/Dreps/q');
    advance(4); // today's admissions are due again, the open window is not
    await engine.tick();
    advance(16); // now the open window and the parts of today's open cards are due too
    await engine.tick();
    expect(mock.count('/api/Srv/rcpt/RepairCard/Dreps/q')).toBeGreaterThan(partsReads);
    expect(await counts()).toEqual(before);
  });

  it('tracks new, changed and removed parts and the release without deleting anything', async () => {
    const c1 = card(1);
    c1.row = { ...c1.row, DrcdCarSt: 9, DrcdExtDte: today, DrcdExtTim: '12:30', DrcdUpdDte: '2026/11/23 12:30:00' };
    c1.parts = [mockPartRow(11, { DrepState: 'تأیید شده', DrepFinalQty: 2 }), mockPartRow(13)];
    advance(4);
    await engine.tick();
    const d = await detail(880001);
    expect(d.isOpen).toBe(false);
    expect(d.statusText).toBe('ترخیص شده');
    expect(d.parts).toHaveLength(3);
    expect(d.parts.find((p) => p.lineId === '12')!.removedAt).not.toBeNull();
    expect(d.parts.find((p) => p.lineId === '11')).toMatchObject({ state: 'تأیید شده', qtyFinal: '2', removedAt: null });
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['status', 'released', 'part_added', 'part_changed', 'part_removed']));
    expect((await search('released')).items.map((r) => r.admissionNo)).toEqual(['1405020001']);
    expect((await search('open')).total).toBe(2);
    // The part comes back: restored, not duplicated.
    c1.parts = [...c1.parts, mockPartRow(12, { DrepDEmdadFlg: 1 })];
    c1.row = { ...c1.row, DrcdUpdDte: '2026/11/23 12:40:00' };
    advance(4);
    await engine.tick();
    const again = await detail(880001);
    expect(again.parts).toHaveLength(3);
    expect(again.parts.find((p) => p.lineId === '12')!.removedAt).toBeNull();
    expect(again.events.map((e) => e.kind)).toContain('part_restored');
  });

  it('records, edits, invoices and cancels work outside the dealership with versions, history and audit', async () => {
    const id = (await receptionOf(880002)).id;
    await expert.post(`/reception/${id}/external-work`, { contractorName: 'x', description: 'تراشکاری', sentAt: new Date().toISOString() }).expect(403);
    expect((await admin.get('/reception/contractors').expect(200)).body).toEqual(expect.any(Array));
    await admin.post(`/reception/${id}/external-work`, { description: 'تراشکاری', sentAt: new Date().toISOString() }).expect(400);
    let d = (await admin.post(`/reception/${id}/external-work`, { contractorName: 'تراشکاری ساختگی', description: 'تراش دیسک چرخ', sentAt: new Date().toISOString(), amountRial: 1_500_000 }).expect(201)).body as ReceptionDetail;
    expect(d.externalWork).toHaveLength(1);
    const work = d.externalWork[0]!;
    expect(work).toMatchObject({ contractorName: 'تراشکاری ساختگی', status: 'sent', amountRial: 1_500_000, version: 1 });
    const body = { contractorName: 'تراشکاری ساختگی', description: 'تراش دیسک چرخ', sentAt: work.sentAt, amountRial: 1_800_000, status: 'done' };
    await admin.post(`/reception/external-work/${work.id}`, { ...body, expectedVersion: 7 }).expect(409);
    d = (await admin.post(`/reception/external-work/${work.id}`, { ...body, expectedVersion: 1 }).expect(201)).body as ReceptionDetail;
    expect(d.externalWork[0]).toMatchObject({ status: 'done', amountRial: 1_800_000, version: 2 });
    expect(d.externalWork[0]!.doneAt).not.toBeNull();
    d = (await admin.post(`/reception/external-work/${work.id}/invoices`, { expectedVersion: 2, fileName: 'invoice.png', mime: 'image/png', dataBase64: PNG }).expect(201)).body as ReceptionDetail;
    expect(d.externalWork[0]!.invoices).toHaveLength(1);
    await admin.post(`/reception/external-work/${work.id}/invoices`, { expectedVersion: 3, fileName: 'fake.png', mime: 'image/png', dataBase64: Buffer.from('not an image').toString('base64') }).expect(422);
    const file = await admin.get(`/reception/invoices/${d.externalWork[0]!.invoices[0]!.id}`).expect(200);
    expect(file.headers['content-type']).toContain('image/png');
    d = (await admin.post(`/reception/external-work/${work.id}/cancel`, { expectedVersion: 3, reason: 'اشتباه ثبت شد' }).expect(201)).body as ReceptionDetail;
    expect(d.externalWork[0]).toMatchObject({ status: 'cancelled', cancelReason: 'اشتباه ثبت شد', version: 4 });
    await admin.post(`/reception/external-work/${work.id}/cancel`, { expectedVersion: 4, reason: 'دوباره' }).expect(409);
    d = (await admin.post(`/reception/${id}/notes`, { text: 'مشتری فردا تماس می‌گیرد' }).expect(201)).body as ReceptionDetail;
    expect(d.notes[0]).toMatchObject({ text: 'مشتری فردا تماس می‌گیرد' });
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['external_added', 'external_updated', 'external_cancelled', 'note']));
    const actions = (await db().select({ action: auditEvents.action }).from(auditEvents).where(and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.entityType, 'reception')))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['reception.external_work_added', 'reception.external_work_updated', 'reception.external_work_cancelled', 'reception.invoice_uploaded', 'reception.note_added', 'reception.created']));
  });

  it('after the token expires it logs in exactly once more and continues', async () => {
    const attempts = mock.loginAttempts;
    mock.expireTokens();
    advance(4);
    await engine.tick();
    expect(mock.loginAttempts).toBe(attempts + 1);
    const s = await status();
    expect(s.state).toBe('active');
    expect(s.runs[0]!.outcome).toBe('ok');
  });

  it('stops after two refused logins and waits for the administrator', async () => {
    let s = await status();
    await admin.put('/pulse/credentials', { expectedVersion: s.version, dealerCode: '9999', username: 'Test.User', password: 'wrong-password' }).expect(200);
    const attempts = mock.loginAttempts;
    const notices = (await counts()).notices;
    advance(4);
    await engine.tick();
    expect(mock.loginAttempts).toBe(attempts + 1);
    expect((await status()).lastErrorCode).toBe('KASB_LOGIN_FAILED');
    advance(4);
    await engine.tick();
    expect(mock.loginAttempts).toBe(attempts + 2);
    s = await status();
    expect(s.state).toBe('login_failed');
    advance(4);
    await engine.tick();
    advance(4);
    await engine.tick();
    expect(mock.loginAttempts).toBe(attempts + 2); // no login loop
    const n = await db().select().from(notifications).where(and(eq(notifications.tenantId, tenantId), eq(notifications.kind, 'pulse.attention')));
    expect(n.length).toBeGreaterThan(0);
    expect((await counts()).notices).toBeGreaterThan(notices);
  });

  it('on a captcha it stops, shows the image and logs in once with the administrator’s answer', async () => {
    let s = await status();
    await admin.put('/pulse/credentials', { expectedVersion: s.version, dealerCode: '9999', username: 'Test.User', password: mock.password }).expect(200);
    await admin.post('/pulse/captcha', { answer: '1234' }).expect(409); // nothing to answer yet
    mock.captchaImage = 'data:image/png;base64,iVBORw0KGgo=';
    const attempts = mock.loginAttempts;
    advance(4);
    await engine.tick();
    s = await status();
    expect(s).toMatchObject({ state: 'captcha', captchaImage: mock.captchaImage });
    expect(mock.loginAttempts).toBe(attempts);
    await admin.post('/pulse/captcha', { answer: '۴۸۲۱' }).expect(201);
    await engine.tick();
    s = await status();
    expect(s).toMatchObject({ state: 'active', captchaImage: null });
    expect(mock.loginAttempts).toBe(attempts + 1);
    mock.captchaImage = null;
  });

  it('stops when کسب‌وکار asks for a password change', async () => {
    mock.loginStatus = 1;
    mock.expireTokens();
    advance(4);
    await engine.tick();
    expect((await status()).state).toBe('password_change');
    mock.loginStatus = 2;
  });

  it('start/stop only change the flag; the backfill reads day by day with progress', async () => {
    let s = await status();
    s = (await admin.put('/pulse/credentials', { expectedVersion: s.version, dealerCode: '9999', username: 'Test.User', password: mock.password }).expect(200)).body as PulseStatus;
    s = (await admin.post('/pulse/stop', { expectedVersion: s.version }).expect(201)).body as PulseStatus;
    expect(s).toMatchObject({ enabled: false, state: 'off' });
    const requests = mock.log.length;
    advance(20);
    await engine.tick();
    expect(mock.log.length).toBe(requests);
    s = (await admin.post('/pulse/start', { expectedVersion: s.version }).expect(201)).body as PulseStatus;
    mock.cards.push({ row: mockCardRow(9, { DrcdRcptDate: jalaliDay(new Date(base - 3 * 86_400_000)) }) });
    await admin.post('/pulse/commands', { kind: 'backfill', from: jalaliDay(new Date(base - 3 * 86_400_000)) }).expect(201);
    await admin.post('/pulse/commands', { kind: 'backfill', from: '1390/01/01' }).expect(422);
    for (let i = 0; i < 3; i++) await engine.tick();
    s = await status();
    expect(s.commands.find((c) => c.kind === 'backfill')).toMatchObject({ status: 'done', progress: { done: 4, total: 4 } });
    expect((await receptionOf(880009)).isOpen).toBe(true);
  });
});

describe('Manage Pulse while the server flag or the secret is missing', () => {
  let h: Harness;
  let admin: Client;
  beforeAll(async () => {
    h = await createHarness({ config: { PULSE_ENABLED: 'false', PULSE_SECRET_KEY: '' } });
    admin = await h.login('admin');
  });
  afterAll(async () => {
    await h.close();
  });

  it('keeps the module on the roadmap and refuses to store a password without the key', async () => {
    const me = (await admin.get('/auth/me').expect(200)).body as { modules: { key: string; status: string }[] };
    expect(me.modules.find((m) => m.key === 'reception')!.status).toBe('planned');
    const s = (await admin.get('/pulse/status').expect(200)).body as PulseStatus;
    expect(s).toMatchObject({ featureEnabled: false, secretReady: false, configured: false });
    const refused = await admin.put('/pulse/credentials', { expectedVersion: 0, dealerCode: '9999', username: 'u', password: 'p' }).expect(422);
    expect(refused.body.code).toBe('PULSE_SECRET_MISSING');
    expect(refused.body.message).toMatch(/PULSE_SECRET_KEY/);
    expect((await admin.post('/reception/search', { view: 'open' }).expect(422)).body.code).toBe('RECEPTION_DISABLED');
    expect((await admin.post('/pulse/commands', { kind: 'test' }).expect(422)).body.code).toBe('PULSE_DISABLED');
  });
});
