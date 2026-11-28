import { eq } from 'drizzle-orm';
import type { AccidentSuggestion, NightListView, ReceptionDetail } from '@manage/shared';
import { newId } from '../src/common/ids';
import { tehranAt } from '../src/daily-reports/daily-time';
import { auditEvents, cases, receptions, tenants } from '../src/db/schema';
import { DEMO_TENANT_CODE } from '../src/demo/demo-seed.service';
import { NightListService } from '../src/pulse/night-list.service';
import { createHarness, type Client, type Harness } from './harness';

// H4 part 6 (owner, 2026-11-28): کسب‌وکار's «احتمال تصادفی» is not reliable. A flagged open card never
// becomes a case by itself; it waits on the accident expert's desk to be linked or rejected. Synthetic data only.
const SECRET = `test-only-pulse-${'k'.repeat(28)}`;
const DAY = '2025-04-23'; // Wednesday

describe('Accident suggestions', () => {
  let h: Harness;
  let expert: Client;
  let reader: Client;
  let tenantId = '';
  const db = () => h.db.db;
  const card = async (n: number, flag: 1 | 2, plate: string) => {
    const id = newId();
    await db().insert(receptions).values({ id, tenantId, kasbRcd: `55${n}`, admissionNo: `AS${n}`, plate, productName: 'خودروی ساختگی', admittedAt: tehranAt(DAY, '09:00'), isOpen: true, official: { DrcdAccident: flag }, rowHash: `as${n}`, isTest: true });
    return id;
  };
  const list = async (c: Client) => (await c.get('/reception/accident-suggestions').expect(200)).body as AccidentSuggestion[];

  beforeAll(async () => {
    h = await createHarness({ config: { PULSE_ENABLED: 'true', PULSE_SECRET_KEY: SECRET } });
    expert = await h.loginAs('as-expert', ['accident_expert']);
    reader = await h.loginAs('as-reader', ['parts_clerk'], ['reception.read', 'case.read']);
    const [t] = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.code, DEMO_TENANT_CODE));
    tenantId = t!.id;
  });
  afterAll(async () => h.close());

  it('lists only open flagged cards without a case; creates no case; offers the same car\'s case first', async () => {
    const before = (await db().select({ id: cases.id }).from(cases)).length;
    const sameCar = (await expert.post('/cases', { admittedAt: tehranAt(DAY, '08:00').toISOString(), vehicle: { model: 'خودروی ساختگی', plate: '11ب111-11' }, customer: { fullName: 'مشتری ساختگی', phone: '09000000081' } }).expect(201)).body as { id: string };
    const other = (await expert.post('/cases', { admittedAt: tehranAt(DAY, '08:10').toISOString(), vehicle: { model: 'خودروی دیگر', plate: '22ج222-22' }, customer: { fullName: 'مشتری ساختگی', phone: '09000000082' } }).expect(201)).body as { id: string };
    const flagged = await card(1, 1, '11 ب 111 - 11');
    await card(2, 2, '33 د 333 - 33'); // «خیر»: never suggested
    const released = await card(3, 1, '44 س 444 - 44');
    await db().update(receptions).set({ isOpen: false, releasedAt: tehranAt(DAY, '12:00') }).where(eq(receptions.id, released));
    const rows = await list(expert);
    expect(rows.map((r) => r.receptionId)).toEqual([flagged]);
    expect(rows[0]!.cases[0]).toMatchObject({ id: sameCar.id, matches: true });
    expect(rows[0]!.cases.map((c) => c.id)).toContain(other.id);
    expect((await db().select({ id: cases.id }).from(cases)).length).toBe(before + 2);
    expect((await list(reader)).length).toBe(1);
  });

  it('confirms with one click: the card is linked and joins the accident night list; only case.update may decide', async () => {
    const [s] = await list(expert);
    await reader.post(`/reception/${s!.receptionId}/accident-decision`, { decision: 'confirm', caseId: s!.cases[0]!.id, expectedVersion: s!.version }).expect(403);
    await expert.post(`/reception/${s!.receptionId}/accident-decision`, { decision: 'confirm', caseId: s!.cases[0]!.id, expectedVersion: s!.version + 1 }).expect(409);
    await expert.post(`/reception/${s!.receptionId}/accident-decision`, { decision: 'confirm', caseId: s!.cases[0]!.id, expectedVersion: s!.version }).expect(201);
    const detail = (await expert.get(`/reception/${s!.receptionId}`).expect(200)).body as ReceptionDetail;
    expect(detail).toMatchObject({ linkState: 'linked', case: { id: s!.cases[0]!.id } });
    expect(await list(expert)).toEqual([]);
    await expert.post(`/reception/${s!.receptionId}/accident-decision`, { decision: 'reject', expectedVersion: s!.version + 1 }).expect(409);
    expect((await db().select().from(auditEvents).where(eq(auditEvents.action, 'reception.accident_confirmed')))).toHaveLength(1);
    await h.app.get(NightListService).generate(tenantId, DAY, null, true, tehranAt(DAY, '18:00'), 'accident');
    const accidentList = (await expert.post('/reception/night-list', { day: DAY, kind: 'accident' }).expect(201)).body as NightListView;
    expect(accidentList.rows.map((r) => r.receptionId)).toContain(s!.receptionId);
  });

  it('rejects with one click: never suggested again', async () => {
    const id = await card(4, 1, '55 ط 555 - 55');
    const s = (await list(expert)).find((r) => r.receptionId === id)!;
    await expert.post(`/reception/${id}/accident-decision`, { decision: 'reject', reason: 'تصادفی نیست', expectedVersion: s.version }).expect(201);
    expect((await list(expert)).some((r) => r.receptionId === id)).toBe(false);
    expect(((await expert.get(`/reception/${id}`).expect(200)).body as ReceptionDetail).linkState).toBe('rejected');
  });
});
