import { eq } from 'drizzle-orm';
import type { NightListView, ReceptionDayStats, ReceptionList } from '@manage/shared';
import { newId } from '../src/common/ids';
import { tehranAt } from '../src/daily-reports/daily-time';
import { receptions, tenants } from '../src/db/schema';
import { DEMO_TENANT_CODE } from '../src/demo/demo-seed.service';
import { NightListService } from '../src/pulse/night-list.service';
import { admissionKey } from '../src/pulse/pulse-map';
import { createHarness, type Client, type Harness } from './harness';

// H4 part 5 (owner 2026-11-28): the demo seed's sample receptions must not appear next to real ones
// (staging is the demo dealership and Pulse reads real cards into it). Synthetic data only.
const SECRET = `test-only-pulse-${'k'.repeat(28)}`;
const DAY = '2025-04-20'; // a Sunday, a working day in the default calendar

describe('Demo receptions next to real ones', () => {
  let h: Harness;
  let admin: Client;
  let service: NightListService;
  let tenantId = '';
  const db = () => h.db.db;

  const reception = async (admissionNo: string, isDemo: boolean, admittedAt: Date) => {
    await db().insert(receptions).values({
      id: newId(), tenantId, kasbRcd: `rcd-${admissionNo}`, admissionNo, admissionNoKey: admissionKey(admissionNo), vin: isDemo ? `TESTVIN${admissionNo.slice(-10)}` : null,
      productName: 'خودروی ساختگی', admittedAt, isOpen: true, official: {}, rowHash: admissionNo, isDemo, isTest: true,
    });
  };
  const open = async () => ((await admin.post('/reception/search', { view: 'open' }).expect(201)).body as ReceptionList).items.map((i) => i.admissionNo).sort();

  beforeAll(async () => {
    h = await createHarness({ config: { PULSE_ENABLED: 'true', PULSE_SECRET_KEY: SECRET } });
    admin = await h.login('admin');
    service = h.app.get(NightListService);
    const [t] = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.code, DEMO_TENANT_CODE));
    tenantId = t!.id;
  });
  afterAll(async () => h.close());

  it('shows demo receptions while they are the only ones, and hides them everywhere once a real one exists', async () => {
    const morning = tehranAt(DAY, '09:00');
    await reception('1405090201', true, morning);
    await reception('1405090202', true, morning);
    expect(await open()).toEqual(['1405090201', '1405090202']);
    // A draft built before any real reception arrived holds the demo cars …
    await service.generate(tenantId, DAY, null, true, tehranAt(DAY, '12:00'));
    expect(((await admin.post('/reception/night-list', { day: DAY }).expect(201)).body as NightListView).rows.map((r) => r.admissionNo).sort()).toEqual(['1405090201', '1405090202']);

    await reception('1405020999', false, morning);
    expect(await open()).toEqual(['1405020999']);
    // … and they drop off it once real data exists; the real car is added.
    await service.generate(tenantId, DAY, null, true, tehranAt(DAY, '12:30'));
    const list = (await admin.post('/reception/night-list', { day: DAY }).expect(201)).body as NightListView;
    expect(list.rows.map((r) => r.admissionNo)).toEqual(['1405020999']);
    expect(list.excluded).toEqual([]);
    const stats = (await admin.post('/reception/stats', { date: DAY }).expect(201)).body as ReceptionDayStats;
    expect(stats.total).toBe(1);
  });
});
