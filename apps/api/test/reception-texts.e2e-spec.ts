import { eq } from 'drizzle-orm';
import type { ReceptionDayStats, ReceptionDetail } from '@manage/shared';
import { newId } from '../src/common/ids';
import { tehranAt } from '../src/daily-reports/daily-time';
import { receptionDefects, receptionRepairs, receptions, tenants } from '../src/db/schema';
import { DEMO_TENANT_CODE } from '../src/demo/demo-seed.service';
import { createHarness, type Client, type Harness } from './harness';

// H4 part 3 (owner, 2026-11-28): coded fields of a card shown as the text کسب‌وکار writes beside them;
// «عدم تمایل به انجام تعمیر» shown apart and never counted as work. Synthetic data only; the official
// rows carry only the columns this test needs.
const SECRET = `test-only-pulse-${'k'.repeat(28)}`;
const DAY = '2025-04-22'; // Tuesday

describe('Reception folder texts', () => {
  let h: Harness;
  let admin: Client;
  let tenantId = '';
  let id = '';
  const db = () => h.db.db;

  beforeAll(async () => {
    h = await createHarness({ config: { PULSE_ENABLED: 'true', PULSE_SECRET_KEY: SECRET } });
    admin = await h.login('admin');
    const [t] = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.code, DEMO_TENANT_CODE));
    tenantId = t!.id;
    id = newId();
    await db().insert(receptions).values({ id, tenantId, kasbRcd: '660001', admissionNo: 'TX1', vin: 'TESTVIN0000006601', admittedAt: tehranAt(DAY, '09:00'), isOpen: true, official: { DrcdAccident: 1 }, rowHash: 'tx1', isTest: true });
    const line = (n: number, code: string, state: string, stateText: string) => ({
      id: newId(), tenantId, receptionId: id, kasbLineId: `tx${n}`, code, state, rowHash: `txr${n}`, isTest: true,
      official: { DrerGrprRpr: code, DrerState: state, VDrerStateDesc: stateText, VDesc: '131100 - موتور از روی گاز به بنزین می رود' },
    });
    await db().insert(receptionRepairs).values([line(1, '11115A0', '2', 'عدم تمایل به انجام تعمیر'), line(2, '13160C0', '3', 'نهایی')]);
    await db().insert(receptionDefects).values({ id: newId(), tenantId, receptionId: id, kasbLineId: 'txd1', state: '5', type: '1', rowHash: 'txd1', isTest: true, official: { DrefState: 5, VDrefStateDesc: 'تائید كیفیت', VCode: '131100', GtrbDesc: 'موتور از روی گاز به بنزین می رود' } });
  });
  afterAll(async () => h.close());

  it('shows state texts, the defect group and «احتمال تصادفی» as words; a refused labour line is marked apart', async () => {
    const r = (await admin.get(`/reception/${id}`).expect(200)).body as ReceptionDetail;
    expect(r.vehicle.accident).toBe('بله');
    expect(r.defects[0]).toMatchObject({ state: 'تائید کیفیت', groupCode: '131100', groupTitle: 'موتور از روی گاز به بنزین می رود' });
    const byCode = Object.fromEntries(r.repairs.map((x) => [x.code, x]));
    expect(byCode['11115A0']).toMatchObject({ state: 'عدم تمایل به انجام تعمیر', stateCode: '2', declined: true });
    expect(byCode['13160C0']).toMatchObject({ state: 'نهایی', stateCode: '3', declined: false });
  });

  it('counts the refused line apart and the other one as technical repair', async () => {
    const stats = (await admin.post('/reception/stats', { date: DAY }).expect(201)).body as ReceptionDayStats;
    expect(stats.declinedLabour).toBe(1);
    expect(stats.jobs).toMatchObject({ technicalRepair: 1, oilChange: 0, none: 0 });
  });
});
