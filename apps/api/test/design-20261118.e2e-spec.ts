import type { CaseDetail, CaseListItem, ControlRoomSnapshot, DeskFolder, Paged, ReportResult } from '@manage/shared';
import { SERVICE_KPIS } from '@manage/shared';
import { Client, createHarness, daysAgo, daysAhead, type Harness } from './harness';

// Owner design release (2026-11-18): independent «تعویض اتاق», and the four approved
// service-manager numbers with one definition for dashboard, report and export.
// Synthetic data only: TESTVIN…, 0900… phones, invented plates.
let h: Harness;
let expert: Client;
let manager: Client;

beforeAll(async () => {
  h = await createHarness();
  [expert, manager] = await Promise.all([h.login('expert'), h.login('manager')]);
});
afterAll(async () => h?.close());

async function newCase(extra: Record<string, unknown> = {}): Promise<CaseDetail> {
  const res = await expert.post('/cases', {
    customer: { fullName: 'مشتری آزمون طرح', phone: '09000007777' },
    vehicle: { brand: 'ایران‌خودرو', model: 'دنا پلاس توربو', trim: 'تیپ ۲ اتوماتیک', plate: '۲۳ ب ۴۵۶ ایران ۱۶', vin: `TESTVIN${Math.random().toString().slice(2, 12)}` },
    admittedAt: daysAgo(2),
    coverageType: 'golden_card',
    goldenCardFileNo: 'GC-TEST-77',
    damageDescription: 'آزمون طرح مصوب',
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body;
}

describe('«تعویض اتاق»', () => {
  it('is independent of coverage, saved at intake and edit, and false for cases that never had it', async () => {
    const old = await newCase({ damageDescription: 'تعویض اتاق' });
    // Not inferred from the damage text, price or parts.
    expect(old.bodyReplacement).toBe(false);
    const c = await newCase({ bodyReplacement: true });
    expect(c.bodyReplacement).toBe(true);
    expect(c.coverageType).toBe('golden_card');
    const list = (await expert.get('/cases?pageSize=100')).body as Paged<CaseListItem>;
    expect(list.items.find((x) => x.id === c.id)!.bodyReplacement).toBe(true);
    const folder = (await expert.get(`/desk/folders/${c.id}`)).body as DeskFolder;
    expect(folder).toMatchObject({ bodyReplacement: true, vehicle: 'دنا پلاس', vehicleFull: 'ایران خودرو دنا پلاس توربو تیپ 2 اتوماتیک' });
    const ins = await expert.patch(`/cases/${c.id}`, { expectedVersion: c.version, coverageType: 'insurance', insurerName: 'بیمهٔ نمونه', insuranceClaimNo: 'INS-TEST-1' });
    expect(ins.body).toMatchObject({ coverageType: 'insurance', bodyReplacement: true });
    const off = await expert.patch(`/cases/${c.id}`, { expectedVersion: ins.body.version, bodyReplacement: false });
    expect(off.body.bodyReplacement).toBe(false);
    const own = await expert.patch(`/cases/${c.id}`, { expectedVersion: off.body.version, coverageType: 'personal', bodyReplacement: true });
    expect(own.body).toMatchObject({ coverageType: 'personal', bodyReplacement: true });
    expect((await expert.patch(`/cases/${c.id}`, { expectedVersion: own.body.version, bodyReplacement: 'yes' })).status).toBe(400);
  });
});

describe('four service numbers', () => {
  it('match between dashboard, manager report and its export, and each number is its exact list', async () => {
    const late = await newCase({ officialDeadlineAt: daysAgo(1) });
    await newCase({ officialDeadlineAt: daysAhead(5) });
    const room = (await manager.get('/control-room')).body as ControlRoomSnapshot;
    expect(room.service.map((k) => k.key)).toEqual(['present', 'overdue_official', 'unassigned', 'blocked']);
    for (const k of room.service) {
      expect(k.count).toBe(k.items.length);
      expect(k.label).toBe(SERVICE_KPIS[k.key].label);
      expect(k.definition).toBe(SERVICE_KPIS[k.key].definition);
    }
    const byKey = Object.fromEntries(room.service.map((k) => [k.key, k]));
    expect(byKey.overdue_official!.items.map((i) => i.caseId)).toContain(late.id);
    // Vehicles are counted once.
    expect(new Set(byKey.present!.items.map((i) => i.caseId)).size).toBe(byKey.present!.count);

    const report = (await manager.get('/reports?view=manager')).body as ReportResult;
    const value = (key: string) => report.kpis.find((k) => k.key === key)!;
    expect(value('vehicles')).toMatchObject({ value: byKey.present!.count, label: SERVICE_KPIS.present.label, definition: SERVICE_KPIS.present.definition });
    expect(value('overdue_official')).toMatchObject({ value: byKey.overdue_official!.count, listQuery: 'flag=overdue_official' });
    expect(value('unassigned')).toMatchObject({ value: byKey.unassigned!.count, listQuery: 'flag=unassigned' });
    expect(value('blocked')).toMatchObject({ value: byKey.blocked!.count, unit: 'خودرو' });

    // The case list behind a case-counted number has the same rows.
    const overdueList = (await manager.get('/cases?flag=overdue_official&pageSize=100')).body as Paged<CaseListItem>;
    expect(overdueList.items.map((c) => c.id).sort()).toEqual(byKey.overdue_official!.items.map((i) => i.caseId).sort());
    const unassignedList = (await manager.get('/cases?flag=unassigned&pageSize=100')).body as Paged<CaseListItem>;
    expect(unassignedList.items.map((c) => c.id).sort()).toEqual(byKey.unassigned!.items.map((i) => i.caseId).sort());

    // Today's follow-ups: the late case is listed with its reason; never an action.
    const f = room.followUps.find((x) => x.caseId === late.id);
    expect(f).toMatchObject({ reason: 'گذشته از مهلت رسمی', tone: 'stop' });
  });
});
