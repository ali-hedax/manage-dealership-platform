import { and, eq, inArray } from 'drizzle-orm';
import type { NightListPending, NightListView, ReceptionDayStats } from '@manage/shared';
import { newId } from '../src/common/ids';
import { tehranAt } from '../src/daily-reports/daily-time';
import { auditEvents, nightLists, notifications, receptionParts, receptionRepairs, receptions, tenants, users } from '../src/db/schema';
import { DEMO_TENANT_CODE } from '../src/demo/demo-seed.service';
import { NightListService } from '../src/pulse/night-list.service';
import { admissionKey } from '../src/pulse/pulse-map';
import { createHarness, type Client, type Harness } from './harness';

// «لیست شب» (reconstruction scenario, owner 2026-11-25). Fixed past working days on the Tehran
// calendar (Sunday 2025-04-20 and Monday 2025-04-21); the service is driven with its own clock.
// Synthetic data only: TESTVIN…, invented names and plates.
const SECRET = `test-only-pulse-${'k'.repeat(28)}`;
const DAY1 = '2025-04-20';
const DAY2 = '2025-04-21';
const THURSDAY = '2025-04-24'; // half day in the default work calendar: 08:00–13:00

describe('Nightly list of the reception module', () => {
  let h: Harness;
  let admin: Client;
  let reader: Client;
  let clerk: Client;
  let service: NightListService;
  let tenantId = '';
  const db = () => h.db.db;
  const view = async (c: Client, day: string) => (await c.post('/reception/night-list', { day }).expect(201)).body as NightListView;

  const reception = async (n: number, admittedAt: Date, isOpen = true) => {
    const id = newId();
    await db().insert(receptions).values({ id, tenantId, kasbRcd: `77${n}`, admissionNo: `NL${n}`, admissionNoKey: admissionKey(`NL${n}`), vin: `TESTVIN${String(n).padStart(10, '7')}`, plate: `${n}${n} ب ${n}${n}${n} - ${n}${n}`, productName: 'خودروی ساختگی', customerName: `مشتری ساختگی ${n}`, admittedAt, isOpen, official: {}, rowHash: `n${n}`, isTest: true });
    await db().insert(receptionRepairs).values({ id: newId(), tenantId, receptionId: id, kasbLineId: `nl${n}`, code: '7777', description: 'صافکاری ساختگی', state: 'باز', official: {}, rowHash: `nr${n}`, isTest: true });
    return id;
  };

  beforeAll(async () => {
    h = await createHarness({ config: { PULSE_ENABLED: 'true', PULSE_SECRET_KEY: SECRET } });
    admin = await h.login('admin');
    reader = await h.loginAs('night-reader', ['accident_expert'], ['reception.read']);
    clerk = await h.loginAs('night-clerk', ['accident_expert'], ['reception.read', 'reception.night_list']);
    await h.loginAs('night-manager', ['service_manager']);
    service = h.app.get(NightListService);
    const [t] = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.code, DEMO_TENANT_CODE));
    tenantId = t!.id;
    const morning = (day: string, back: number) => new Date(tehranAt(day, '09:00').getTime() - back * 86_400_000);
    await reception(1, morning(DAY1, 3));
    await reception(2, morning(DAY1, 0));
    await reception(3, morning(DAY1, 1));
    await reception(4, morning(DAY1, 2), false);
  });
  afterAll(async () => h.close());

  it('waits for 18:00 on a working day, then builds the draft once from the open receptions', async () => {
    expect(((await reader.post('/reception/night-list', { day: DAY1 }).expect(201)).body as NightListPending)).toMatchObject({ status: 'not_generated', workingDay: true });
    expect(await service.tick(tehranAt(DAY1, '17:59'))).toEqual({ generated: 0, alerted: 0 });
    expect((await service.tick(tehranAt(DAY1, '18:00'))).generated).toBeGreaterThanOrEqual(1);
    expect((await service.tick(tehranAt(DAY1, '18:01'))).generated).toBe(0);
    const list = await view(reader, DAY1);
    expect(list).toMatchObject({ day: DAY1, status: 'draft', missingReasons: 3, late: true });
    expect(list.rows.map((r) => r.admissionNo)).toEqual(['NL1', 'NL3', 'NL2']);
    expect(list.rows.map((r) => r.daysIn)).toEqual([4, 2, 1]);
    expect(list.rows[0]).toMatchObject({ vehicleName: expect.any(String), ownerName: 'مشتری ساختگی 1', labour: ['صافکاری ساختگی (باز)'], reason: null, carried: false, isOpen: true });
  });

  it('lets only the reception staff set reasons; «سایر» needs a note; versions protect concurrent edits', async () => {
    const list = await view(clerk, DAY1);
    const row = list.rows[0]!;
    await reader.post(`/reception/night-list/items/${row.id}`, { expectedVersion: row.version, reason: 'waiting_parts' }).expect(403);
    await clerk.post(`/reception/night-list/items/${row.id}`, { expectedVersion: row.version, reason: 'other' }).expect(400);
    const after = (await clerk.post(`/reception/night-list/items/${row.id}`, { expectedVersion: row.version, reason: 'waiting_parts', currentStation: 'باتری‌سازی 36', nextStations: 'مکانیکی 99' }).expect(201)).body as NightListView;
    expect(after.rows[0]).toMatchObject({ reason: 'waiting_parts', currentStation: 'باتری‌سازی 36', nextStations: 'مکانیکی 99', setByName: expect.any(String) });
    expect(after.missingReasons).toBe(2);
    await clerk.post(`/reception/night-list/items/${row.id}`, { expectedVersion: row.version, reason: 'station_load' }).expect(409);
    expect((await db().select().from(auditEvents).where(eq(auditEvents.action, 'reception.night_list_item_set'))).length).toBe(1);
  });

  it('tells the service manager once at 18:45 while it is still a draft', async () => {
    const [manager] = await db().select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.username, 'night-manager')));
    expect((await service.tick(tehranAt(DAY1, '18:44'))).alerted).toBe(0);
    expect((await service.tick(tehranAt(DAY1, '18:46'))).alerted).toBeGreaterThanOrEqual(1);
    expect((await service.tick(tehranAt(DAY1, '18:50'))).alerted).toBe(0);
    const late = await db().select().from(notifications).where(and(eq(notifications.userId, manager!.id), eq(notifications.kind, 'night_list_late')));
    expect(late).toHaveLength(1);
  });

  it('is sent by the supervisor with reasons still missing (a warning, not a lock) and exports to Excel', async () => {
    const list = await view(admin, DAY1);
    await clerk.post(`/reception/night-list/${list.id}/send`, { expectedVersion: list.version }).expect(403);
    const sent = (await admin.post(`/reception/night-list/${list.id}/send`, { expectedVersion: list.version }).expect(201)).body as NightListView;
    expect(sent).toMatchObject({ status: 'sent', missingReasons: 2, late: false, sentByName: expect.any(String) });
    await admin.post(`/reception/night-list/${list.id}/send`, { expectedVersion: sent.version }).expect(409);
    const [manager] = await db().select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.username, 'night-manager')));
    expect(await db().select().from(notifications).where(and(eq(notifications.userId, manager!.id), eq(notifications.kind, 'night_list_sent')))).toHaveLength(1);
    const file = await reader.get(`/reception/night-list/${list.id}/excel`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(String(file.headers['content-type'])).toContain('spreadsheetml');
    expect((file.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('copies yesterday\'s reason for a vehicle still open the next evening; released vehicles drop off', async () => {
    await db().update(receptions).set({ isOpen: false }).where(and(eq(receptions.tenantId, tenantId), eq(receptions.admissionNo, 'NL2')));
    await service.tick(tehranAt(DAY2, '18:00'));
    const next = await view(reader, DAY2);
    expect(next.rows.map((r) => r.admissionNo)).toEqual(['NL1', 'NL3']);
    expect(next.rows[0]).toMatchObject({ reason: 'waiting_parts', carried: true, currentStation: 'باتری‌سازی 36', daysIn: 5 });
    expect(next.rows[1]).toMatchObject({ reason: null, carried: false });
    expect(next.missingReasons).toBe(1);
  });

  it('on a half-day Thursday builds the list at 12:30 and is due at 13:15 (work calendar), not at 18:00', async () => {
    const before = (await reader.post('/reception/night-list', { day: THURSDAY }).expect(201)).body as NightListPending;
    expect(before).toMatchObject({ status: 'not_generated', workingDay: true, generatesAt: tehranAt(THURSDAY, '12:30').toISOString(), previousDay: DAY2 });
    expect((await service.tick(tehranAt(THURSDAY, '12:29'))).generated).toBe(0);
    expect((await service.tick(tehranAt(THURSDAY, '12:30'))).generated).toBeGreaterThanOrEqual(1);
    const list = await view(reader, THURSDAY);
    expect(list).toMatchObject({ status: 'draft', deadline: tehranAt(THURSDAY, '13:15').toISOString(), late: true, previousDay: DAY2, nextDay: null });
    const [manager] = await db().select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.username, 'night-manager')));
    expect((await service.tick(tehranAt(THURSDAY, '13:14'))).alerted).toBe(0);
    expect((await service.tick(tehranAt(THURSDAY, '13:16'))).alerted).toBeGreaterThanOrEqual(1);
    const late = await db().select().from(notifications).where(and(eq(notifications.userId, manager!.id), eq(notifications.kind, 'night_list_late'), eq(notifications.dedupeKey, `night_list_late:${THURSDAY}`)));
    expect(late).toHaveLength(1);
    expect(late[0]!.body).toContain('۱۳:۱۵');
  });

  it('keeps past lists: each list links to the previous and next day that has one', async () => {
    expect(await view(reader, DAY1)).toMatchObject({ previousDay: null, nextDay: DAY2 });
    expect(await view(reader, DAY2)).toMatchObject({ previousDay: DAY1, nextDay: THURSDAY });
    // A full day keeps 18:00 and 18:45.
    expect((await view(reader, DAY2)).deadline).toBe(tehranAt(DAY2, '18:45').toISOString());
    // Friday has no working hours: nothing is built, and the way back to Thursday's list is offered.
    const friday = (await reader.post('/reception/night-list', { day: '2025-04-25' }).expect(201)).body as NightListPending;
    expect(friday).toMatchObject({ status: 'not_generated', workingDay: false, previousDay: THURSDAY });
  });

  it('builds a draft on request for today only', async () => {
    await clerk.post('/reception/night-list/generate', {}).expect(403);
    await admin.post('/reception/night-list/generate', { day: '2999-01-01' }).expect(422);
    const today = (await admin.post('/reception/night-list/generate', {}).expect(201)).body as NightListView | NightListPending;
    // The real «today»: on a Friday or holiday no list is built (work calendar), otherwise a draft.
    if ('workingDay' in today && today.workingDay === false) expect(today.status).toBe('not_generated');
    else expect(today.status).toBe('draft');
  });

  it('reconciles at the cut-off, audits manual presence and freezes the approved rows', async () => {
    const day = '2025-04-26';
    const arriving = await reception(5, tehranAt(day, '09:00'));
    const afterCutoff = await reception(6, tehranAt(day, '18:01'));
    const sameVehicle = await reception(7, tehranAt(day, '10:00'));
    await db().update(receptions).set({ vin: 'TESTVIN7777777775' }).where(eq(receptions.id, sameVehicle));
    await db().update(receptionRepairs).set({ description: '۷۷۷۷' }).where(eq(receptionRepairs.receptionId, arriving));
    await reader.get('/reception/labour-review').expect(403);
    expect((await admin.get('/reception/labour-review').expect(200)).body.rows)
      .toContainEqual(expect.objectContaining({ receptionId: arriving }));
    await service.tick(tehranAt(day, '18:00'));
    let draft = await view(admin, day);
    expect(draft.rows.find((r) => r.receptionId === arriving)?.labour).toEqual(['نام اجرت در منبع مشخص نیست (باز)']);
    expect(draft.rows.some((r) => r.receptionId === afterCutoff)).toBe(false);
    expect(draft.physicalVehicleCount).toBe(draft.rows.length - 1);
    const row = draft.rows.find((r) => r.receptionId === arriving)!;
    await clerk.post(`/reception/night-list/items/${row.id}`, { expectedVersion: row.version, reason: 'waiting_parts' }).expect(201);
    await db().update(receptions).set({ isOpen: false, releasedAt: tehranAt(day, '17:59') }).where(eq(receptions.id, arriving));
    await service.tick(tehranAt(day, '18:10'));
    draft = await view(admin, day);
    expect(draft.excluded).toContainEqual(expect.objectContaining({ id: row.id, reason: 'waiting_parts' }));
    const url = `/reception/night-list/${draft.id}/presence`;
    const correction = { expectedVersion: draft.version, admissionNo: 'NL5', present: true, reason: 'خودرو در محوطه دیده شد' };
    await clerk.post(url, correction).expect(403);
    await admin.post(url, { ...correction, reason: '' }).expect(400);
    draft = (await admin.post(url, correction).expect(201)).body as NightListView;
    expect(draft.rows).toContainEqual(expect.objectContaining({ id: row.id, reason: 'waiting_parts', correction: { present: true, reason: correction.reason } }));
    await admin.post(url, correction).expect(409);
    expect((await db().select().from(auditEvents).where(eq(auditEvents.action, 'reception.night_list_presence_corrected')))).toHaveLength(1);
    draft = (await admin.post(url, { expectedVersion: draft.version, admissionNo: 'NL7', present: false, reason: 'کارت باز، خودرو خارج شده' }).expect(201)).body as NightListView;
    expect(draft.excluded).toContainEqual(expect.objectContaining({ receptionId: sameVehicle, correction: { present: false, reason: 'کارت باز، خودرو خارج شده' } }));
    await db().update(receptions).set({ isOpen: false, releasedAt: tehranAt('2025-04-27', '09:00') }).where(eq(receptions.id, arriving));
    const approved = (await admin.post(`/reception/night-list/${draft.id}/send`, { expectedVersion: draft.version }).expect(201)).body as NightListView;
    await db().update(receptions).set({ customerName: 'نام جدید', isOpen: true }).where(eq(receptions.id, arriving));
    await db().update(receptionRepairs).set({ description: 'اجرت تازه', state: 'انجام شد' }).where(eq(receptionRepairs.receptionId, arriving));
    expect((await view(reader, day)).rows).toEqual(approved.rows);
    await admin.post(url, { ...correction, expectedVersion: approved.version }).expect(409);
    await clerk.post(`/reception/night-list/items/${row.id}`, { expectedVersion: row.version, reason: 'station_load' }).expect(409);
    await db().update(nightLists).set({ approvedSnapshot: null }).where(eq(nightLists.id, approved.id));
    // An approved list without a snapshot stays visible with what staff recorded, but no live labour status.
    const historical = await view(reader, day);
    expect(historical).toMatchObject({ historicalIncomplete: true, physicalVehicleCount: null, excluded: [] });
    expect(historical.rows).toContainEqual(expect.objectContaining({ id: row.id, reason: 'waiting_parts', labour: ['نامشخص'] }));
    expect(historical.rows.some((r) => r.receptionId === sameVehicle)).toBe(false);
    expect(historical.rows.flatMap((r) => r.labour).every((l) => l === 'نامشخص')).toBe(true);
  });

  it('hotfix H1: a repair and an accident list each day, sent on their own; stations, free text and the day summary', async () => {
    const day = '2025-04-29'; // Tuesday
    const kase = (await admin.post('/cases', { admittedAt: tehranAt(day, '08:00').toISOString(), vehicle: { model: 'خودروی ساختگی', plate: 'پلاک ساختگی' }, customer: { fullName: 'مشتری ساختگی', phone: '09000000077' } }).expect(201)).body as { id: string };
    const repairCar = await reception(31, tehranAt(day, '09:00'));
    const accidentCar = await reception(32, tehranAt(day, '09:30'));
    await db().update(receptions).set({ caseId: kase.id, receptionist: 'پذیرشگر ساختگی' }).where(eq(receptions.id, accidentCar));
    await db().update(receptions).set({ receptionist: 'پذیرشگر ساختگی' }).where(eq(receptions.id, repairCar));
    expect((await reader.post('/reception/night-list', { day, kind: 'accident' }).expect(201)).body).toMatchObject({ status: 'not_generated', kind: 'accident' });
    await service.tick(tehranAt(day, '18:00'));
    const repair = await view(reader, day);
    const accident = (await reader.post('/reception/night-list', { day, kind: 'accident' }).expect(201)).body as NightListView;
    expect(repair).toMatchObject({ kind: 'repair', status: 'draft' });
    expect(accident).toMatchObject({ kind: 'accident', status: 'draft' });
    expect(accident.id).not.toBe(repair.id);
    expect(repair.rows.map((r) => r.receptionId)).toContain(repairCar);
    expect(repair.rows.map((r) => r.receptionId)).not.toContain(accidentCar);
    expect(accident.rows.map((r) => r.receptionId)).toEqual([accidentCar]);
    expect(Array.isArray(repair.stations)).toBe(true);
    // «گزارش شب»: receptions admitted that day, per receptionist.
    expect(repair.summary).toMatchObject({ date: day, total: 2 });
    expect(repair.summary!.byReceptionist).toContainEqual(expect.objectContaining({ name: 'پذیرشگر ساختگی', total: 2 }));
    // «ندارد», a station typed by hand and «سایر» with the receptionist's own text, kept as typed.
    const row = accident.rows[0]!;
    const set = (await clerk.post(`/reception/night-list/items/${row.id}`, { expectedVersion: row.version, reason: 'other', reasonNote: 'منتظر کارشناس بیمه', currentStation: 'ندارد', nextStations: 'صافکاری بیرون از نمایندگی' }).expect(201)).body as NightListView;
    expect(set.kind).toBe('accident');
    expect(set.rows[0]).toMatchObject({ reason: 'other', reasonNote: 'منتظر کارشناس بیمه', currentStation: 'ندارد', nextStations: 'صافکاری بیرون از نمایندگی' });
    // Late alerts, one per list, then each list is sent on its own.
    expect((await service.tick(tehranAt(day, '18:46'))).alerted).toBeGreaterThanOrEqual(2);
    const keys = (await db().select({ k: notifications.dedupeKey }).from(notifications).where(eq(notifications.tenantId, tenantId))).map((n) => n.k);
    expect(keys).toEqual(expect.arrayContaining([`night_list_late:${day}`, `night_list_late:${day}:accident`]));
    const sent = (await admin.post(`/reception/night-list/${accident.id}/send`, { expectedVersion: set.version }).expect(201)).body as NightListView;
    expect(sent).toMatchObject({ kind: 'accident', status: 'sent' });
    expect((await view(reader, day)).status).toBe('draft');
    const file = await reader.get(`/reception/night-list/${accident.id}/excel`).expect(200);
    expect(file.headers['content-disposition']).toContain(`night-list-${day}-accident.xlsx`);
  });

  it('C5: the night report counts «تعویض روغن» and «تعمیر فنی» apart from labour names and used parts, per receptionist', async () => {
    const day = '2025-04-30'; // Wednesday
    const both = await reception(41, tehranAt(day, '09:00'));
    const oilOnly = await reception(42, tehranAt(day, '09:30'));
    const repairOnly = await reception(43, tehranAt(day, '10:00'));
    await db().update(receptions).set({ receptionist: 'پذیرشگر ساختگی الف' }).where(eq(receptions.id, both));
    await db().update(receptions).set({ receptionist: 'پذیرشگر ساختگی الف' }).where(eq(receptions.id, oilOnly));
    await db().update(receptions).set({ receptionist: 'پذیرشگر ساختگی ب' }).where(eq(receptions.id, repairOnly));
    // 41: «صافکاری ساختگی» and a periodic service → both.
    await db().insert(receptionRepairs).values({ id: newId(), tenantId, receptionId: both, kasbLineId: 'c5-41', code: '0100', description: 'سرويس ۱۰۰۰۰', state: 'باز', official: {}, rowHash: 'c5r41', isTest: true });
    // 42: its labour line was removed in کسب‌وکار; only an oil filter used → oil change only.
    await db().update(receptionRepairs).set({ removedAt: new Date() }).where(eq(receptionRepairs.receptionId, oilOnly));
    await db().insert(receptionParts).values({ id: newId(), tenantId, receptionId: oilOnly, kasbLineId: 'c5-42', name: 'فيلتر روغن', qtyRequested: '1', qtyFinal: '1', state: 'تحویل شده', official: {}, rowHash: 'c5p42', isTest: true });
    // 43: engine oil was rejected (not used) → technical repair only.
    await db().insert(receptionParts).values({ id: newId(), tenantId, receptionId: repairOnly, kasbLineId: 'c5-43', name: 'روغن موتور', qtyRequested: '1', qtyFinal: '0', state: 'ردشده', rejectReason: 'عدم موجودی', official: {}, rowHash: 'c5p43', isTest: true });

    const stats = (await reader.post('/reception/stats', { date: day }).expect(201)).body as ReceptionDayStats;
    expect(stats).toMatchObject({ total: 3, jobs: { quickService: 0, oilChange: 2, technicalRepair: 2, both: 1, none: 0, vehicles: 3 } });
    expect(stats.jobsByReceptionist).toEqual([
      { name: 'پذیرشگر ساختگی الف', total: 2, quickService: 0, oilChange: 2, technicalRepair: 1, both: 1, none: 0, vehicles: 2 },
      { name: 'پذیرشگر ساختگی ب', total: 1, quickService: 0, oilChange: 0, technicalRepair: 1, both: 0, none: 0, vehicles: 1 },
    ]);
    // The same summary rides on the night list.
    const pending = (await reader.post('/reception/night-list', { day }).expect(201)).body as NightListPending;
    expect(pending.summary?.jobs).toEqual(stats.jobs);
  });

  it('H3: a car released after the 12:30 build but before the 13:00 Thursday closing is off the list; one still there at closing is on it', async () => {
    const day = '2025-05-01'; // Thursday, half day: build 12:30, closing 13:00
    const leaves = await reception(51, tehranAt(day, '08:30'));
    const stays = await reception(52, tehranAt(day, '09:00'));
    const lateArrival = await reception(53, tehranAt(day, '12:40'));
    await service.tick(tehranAt(day, '12:30'));
    let list = await view(reader, day);
    expect(list.rows.map((r) => r.receptionId)).toEqual(expect.arrayContaining([leaves, stays]));
    expect(list.rows.some((r) => r.receptionId === lateArrival)).toBe(false);
    // One car leaves at 12:45, before closing; the other only the next working morning.
    await db().update(receptions).set({ isOpen: false, releasedAt: tehranAt(day, '12:45') }).where(eq(receptions.id, leaves));
    await db().update(receptions).set({ isOpen: false, releasedAt: tehranAt('2025-05-03', '08:15') }).where(eq(receptions.id, stays));
    await service.tick(tehranAt(day, '12:50'));
    list = await view(reader, day);
    const ids = list.rows.map((r) => r.receptionId);
    expect(ids).toEqual(expect.arrayContaining([stays, lateArrival]));
    expect(ids).not.toContain(leaves);
    expect(list.excluded.map((r) => r.receptionId)).toContain(leaves);
    // A released car never appears as open on the list.
    expect(list.rows.every((r) => r.receptionId !== leaves)).toBe(true);
    // Earlier lists stay visible: this one links back to the previous day that has one.
    expect(list).toMatchObject({ status: 'draft', previousDay: '2025-04-29' });
    expect((await view(reader, '2025-04-29')).status).toBe('draft');
  });

  it('H3/S09: a Thursday with periodic services, quick service and oil parts counts them — never «۰ تعویض روغن»; one car twice is one car', async () => {
    const day = '2025-05-08'; // Thursday
    const service10k = await reception(61, tehranAt(day, '08:10'));
    const quick = await reception(62, tehranAt(day, '08:20'));
    const oilAndRepair = await reception(63, tehranAt(day, '08:40'));
    const sameCarAgain = await reception(64, tehranAt(day, '10:00'));
    const onlyCode = await reception(65, tehranAt(day, '11:00'));
    await db().update(receptionRepairs).set({ description: 'سرويس ۱۰,۰۰۰ کيلومتري' }).where(eq(receptionRepairs.receptionId, service10k));
    await db().update(receptionRepairs).set({ description: 'سرویس سریع' }).where(eq(receptionRepairs.receptionId, quick));
    await db().insert(receptionParts).values({ id: newId(), tenantId, receptionId: oilAndRepair, kasbLineId: 'h3-63', name: 'روغن موتور ۱۰W40', qtyRequested: '4', qtyFinal: '4', state: 'تحویل شده', official: {}, rowHash: 'h3p63', isTest: true });
    // A second card of the same car that day (same VIN): one car in each count.
    await db().update(receptions).set({ vin: 'TESTVIN7777777763' }).where(eq(receptions.id, sameCarAgain));
    await db().update(receptionRepairs).set({ description: 'تعویض لنت جلو' }).where(eq(receptionRepairs.receptionId, sameCarAgain));
    // Only a code in the source: still work by its code (H4 part 1: «اجرت بی‌نام بدون کار نیست»); the missing name is a data gap.
    await db().update(receptionRepairs).set({ description: '۷۷۷۷' }).where(eq(receptionRepairs.receptionId, onlyCode));
    await db().update(receptions).set({ linesReadAt: tehranAt(day, '11:30') }).where(inArray(receptions.id, [service10k, quick, oilAndRepair, sameCarAgain, onlyCode]));
    const stats = (await reader.post('/reception/stats', { date: day }).expect(201)).body as ReceptionDayStats;
    expect(stats.total).toBe(5);
    expect(stats.jobs).toEqual({ quickService: 1, oilChange: 3, technicalRepair: 2, both: 1, none: 0, vehicles: 4 });
    expect(stats.dataGaps).toEqual({ linesNotRead: 0, labourWithoutName: 1, partsWithoutName: 0 });
    // The night report of that Thursday shows the same counts.
    await service.tick(tehranAt(day, '12:30'));
    expect((await view(reader, day)).summary?.jobs).toEqual(stats.jobs);
  });

  it('H4 part 4: only cars still there at the end of the day; «آماده تحویل» / «در انتظار مراجعه مشتری» get their reason; an early draft keeps up', async () => {
    const day = '2025-05-13'; // Tuesday
    const status = (id: string, statusCode: string, statusText: string, released?: string) =>
      db().update(receptions).set({ statusCode, statusText, ...(released ? { isOpen: false, releasedAt: tehranAt(day, released) } : {}) }).where(eq(receptions.id, id));
    const repairing = await reception(71, tehranAt(day, '08:00'));
    const ready = await reception(72, tehranAt(day, '08:05'));
    const waiting = await reception(73, tehranAt(day, '08:10'));
    const releasedToday = await reception(74, tehranAt(day, '08:15'));
    const cancelled = await reception(75, tehranAt(day, '08:20'));
    const leavesAfterClosing = await reception(76, tehranAt(day, '08:25'));
    await status(repairing, '2', 'در حال تعمیر');
    await status(ready, '6', 'آماده تحویل به مشتری');
    await status(waiting, '7', 'در انتظار مراجعه مشتری');
    await status(releasedToday, '14', 'ترخیص شده', '15:00');
    await status(cancelled, '19', 'انصرافی', '11:00');
    await status(leavesAfterClosing, '2', 'در حال تعمیر');
    // Built early by hand at 10:00, then kept up to date by the minute tick before 18:00.
    await service.generate(tenantId, day, null, true, tehranAt(day, '10:00'));
    const lateMorning = await reception(77, tehranAt(day, '11:00'));
    await service.tick(tehranAt(day, '11:05'));
    let list = await view(reader, day);
    expect(list.rows.map((r) => r.receptionId)).toEqual(expect.arrayContaining([repairing, ready, waiting, lateMorning, leavesAfterClosing]));
    expect(list.rows.find((r) => r.receptionId === ready)).toMatchObject({ reason: 'ready_customer_absent', carried: false });
    expect(list.rows.find((r) => r.receptionId === waiting)).toMatchObject({ reason: 'ready_customer_absent' });
    expect(list.rows.find((r) => r.receptionId === repairing)?.reason).toBeNull();
    // Staff chose a reason today: it stays when the car later becomes «در انتظار مراجعه مشتری».
    const row = list.rows.find((r) => r.receptionId === repairing)!;
    await clerk.post(`/reception/night-list/items/${row.id}`, { expectedVersion: row.version, reason: 'waiting_parts' }).expect(201);
    await status(repairing, '7', 'در انتظار مراجعه مشتری');
    // A car still repairing at 18:00 that leaves at 18:40, after closing: not there that night.
    await service.tick(tehranAt(day, '18:00'));
    await status(leavesAfterClosing, '14', 'ترخیص شده', '18:40');
    await service.tick(tehranAt(day, '19:00'));
    list = await view(reader, day);
    const ids = list.rows.map((r) => r.receptionId);
    expect(ids).toEqual(expect.arrayContaining([repairing, ready, waiting, lateMorning]));
    for (const gone of [releasedToday, cancelled, leavesAfterClosing]) expect(ids).not.toContain(gone);
    expect(list.rows.find((r) => r.receptionId === repairing)).toMatchObject({ reason: 'waiting_parts' });
    expect(list.rows.every((r) => r.isOpen)).toBe(true);
  });

  it('H4 decision 1: a car with a labour line «امداد ویژه» gets «منتظر امداد ویژه»; «آماده تحویل» comes first', async () => {
    const day = '2025-05-14'; // Wednesday
    const aid = await reception(81, tehranAt(day, '08:00'));
    const aidButReady = await reception(82, tehranAt(day, '08:10'));
    const plain = await reception(83, tehranAt(day, '08:20'));
    for (const id of [aid, aidButReady]) {
      await db().insert(receptionRepairs).values({ id: newId(), tenantId, receptionId: id, kasbLineId: `aid-${id}`, code: '53200C9', state: '6', official: { VDrerStateDesc: 'امداد ویژه' }, rowHash: `aid-${id}`, isTest: true });
    }
    await db().update(receptions).set({ statusCode: '6', statusText: 'آماده تحویل به مشتری' }).where(eq(receptions.id, aidButReady));
    await service.tick(tehranAt(day, '18:00'));
    const rows = new Map((await view(reader, day)).rows.map((r) => [r.receptionId, r]));
    expect(rows.get(aid)).toMatchObject({ reason: 'waiting_special_aid', carried: false });
    expect(rows.get(aidButReady)).toMatchObject({ reason: 'ready_customer_absent' });
    expect(rows.get(plain)?.reason).toBeNull();
  });
});
