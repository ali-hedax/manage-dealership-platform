import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { parseJalali, type StoppageCaseView, type StoppageImportPreview, type StoppageListView, type StoppageReport } from '@manage/shared';
import { newId } from '../src/common/ids';
import { auditEvents, dailyReportImports, emdadRequests, receptions, stoppageImports, stoppageItemVersions, tenants, users } from '../src/db/schema';
import { DEMO_TENANT_CODE } from '../src/demo/demo-seed.service';
import { readWorkbook, writeSheet } from '../src/parts/xlsx';
import { StoppagesService } from '../src/stoppages/stoppages.service';
import { createHarness, type Client, type Harness } from './harness';

// «گزارش توقف خودرو» (owner, 2026-11-26). The fixture is the owner's anonymised export (owner names
// «مالک نمونه N», phones 0912000000N) as CSV; it is turned into an .xlsx with the cell types of the
// real export: notice number, km and reference number are number cells, everything else inline text.

/** RFC 4180 CSV (quoted fields may hold commas). */
function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}
const NUMERIC = new Set([0, 6, 12]);
const SAMPLE = csv(readFileSync(join(__dirname, 'fixtures', 'stoppage-sample-anon.csv'), 'utf8').replace(/^\uFEFF/u, ''));
const toXlsx = (grid: string[][], sheet = 'توقف خودرو') => writeSheet(sheet, grid.map((r, ri) => r.map((v, ci) => (ri > 0 && NUMERIC.has(ci) && /^\d+$/.test(v) ? Number(v) : v))));
const col = (name: string) => SAMPLE[0]!.indexOf(name);

describe('Official stoppage report «گزارش توقف خودرو»', () => {
  let h: Harness;
  let admin: Client;
  let clerk: Client;
  let manager: Client;
  let guest: Client;
  let tenantId = '';
  let adminId = '';
  const db = () => h.db.db;
  const send = (c: Client, data: Uint8Array, query: string) => request(h.app.getHttpServer())
    .post(`/api/v1/stoppages/import?${query}`).set('Cookie', c.cookie).set('x-manage-client', 'test').set('content-type', 'application/octet-stream').send(Buffer.from(data));
  const preview = async (c: Client, data: Uint8Array, name = 'stoppage.xlsx') => (await send(c, data, `fileName=${name}`).expect(201)).body as StoppageImportPreview;
  const apply = (c: Client, data: Uint8Array, p: StoppageImportPreview, accept = false) => send(c, data, `fileName=stoppage.xlsx&confirm=${p.fileHash}${accept ? '&acceptWarnings=true' : ''}`);
  const list = async (c: Client, view = 'active') => (await c.get(`/stoppages?view=${view}`).expect(200)).body as StoppageListView;
  const byNotice = async (c: Client, notice: string) => {
    const all = [...(await list(c, 'active')).items, ...(await list(c, 'archive')).items];
    const s = all.find((x) => x.noticeNo === notice);
    return (await c.get(`/stoppages/${s!.id}`).expect(200)).body as StoppageCaseView;
  };
  const at = (jalali: string, time: string, hours = 0) => new Date(parseJalali(jalali, time)!.getTime() + hours * 3_600_000);
  const reception = async (n: number, chassis: string, admittedAt: Date) => {
    const id = newId();
    await db().insert(receptions).values({ id, tenantId, kasbRcd: `88${n}`, admissionNo: `ST${n}`, chassis, admittedAt, isOpen: true, official: {}, rowHash: `st${n}`, isTest: true });
    return id;
  };

  beforeAll(async () => {
    h = await createHarness();
    admin = await h.login('admin');
    clerk = await h.loginAs('stop-clerk', ['parts_clerk']);
    manager = await h.loginAs('stop-manager', ['service_manager']);
    guest = await h.loginAs('stop-guest', ['guest']);
    const [t] = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.code, DEMO_TENANT_CODE));
    tenantId = t!.id;
    const [u] = await db().select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.username, 'admin')));
    adminId = u!.id;
    // 951570 (SDK82226): one open reception in the stop window → linked.
    await reception(1, 'SDK82226', at('1405/09/02', '09:00'));
    // 951951 (RKC17747): two open receptions in the window → ambiguous, goes to review.
    await reception(2, 'RKC17747', at('1405/09/03', '08:00'));
    await reception(3, 'RKC17747', at('1405/09/02', '10:00'));
    // Special aid 140500872400 of SDK82226: two lines of the same number, told apart by the part code; one arrived.
    const importId = newId();
    await db().insert(dailyReportImports).values({ id: importId, tenantId, kind: 'emdad', fileName: 'emdad-test.xlsx', fileSize: 1, fileSha256: 'e'.repeat(64), format: 'xlsx', parserVersion: 'test', uploadedBy: adminId, isTest: true });
    const aid = (key: string, code: string, statusCategory: string) => db().insert(emdadRequests).values({ id: newId(), tenantId, externalKey: key, chassis: 'SDK82226', emdadNo: '140500872400', initialCode: code, official: {}, statusCategory, firstImportId: importId, lastImportId: importId, lastReportAt: new Date(), matchStatus: 'unmatched', isTest: true });
    await aid('st-aid-1', '03709152', 'in_dealer_stock');
    await aid('st-aid-2', '06105108', 'in_supply');
  });
  afterAll(async () => h.close());

  it('reads the official .xlsx layout: 36 rows, 28 stoppages, 3 active, codes kept as text', async () => {
    const book = readWorkbook(toXlsx(SAMPLE));
    expect(book[0]!.name).toBe('توقف خودرو');
    expect(book[0]!.rows[2]![col('شماره مرجع')]).toBe('1565017');
    const p = await preview(clerk, toXlsx(SAMPLE));
    expect(p).toMatchObject({ rows: 36, stoppages: 28, activeStoppages: 3, newRows: 36, changedRows: 0, duplicate: false, blocked: null, needsAcceptance: false, errors: [] });
  });

  it('blocks changed columns, a web page instead of Excel, and an empty file', async () => {
    const fewer = SAMPLE.map((r) => r.slice(0, 21));
    expect((await preview(clerk, toXlsx(fewer))).blocked).toMatch(/تاریخ رد/);
    expect((await preview(clerk, new TextEncoder().encode('<html><body><table><tr><td>ورود</td></tr></table></body></html>'))).blocked).toMatch(/صفحهٔ ورود/);
    expect((await send(clerk, new Uint8Array(), 'fileName=x.xlsx').expect(201)).body.blocked).toMatch(/خالی/);
  });

  it('applies only the previewed file, once; the same file again changes nothing', async () => {
    const data = toXlsx(SAMPLE);
    const p = await preview(clerk, data);
    expect((await send(clerk, data, `fileName=stoppage.xlsx&confirm=${'0'.repeat(64)}`).expect(409)).body.code).toBe('STOPPAGE_FILE_CHANGED');
    const first = (await apply(clerk, data, p).expect(201)).body;
    expect(first.duplicate).toBe(false);
    const again = (await apply(clerk, data, p).expect(201)).body;
    expect(again).toMatchObject({ duplicate: true, importId: first.importId });
    expect(await db().select().from(stoppageImports).where(eq(stoppageImports.tenantId, tenantId))).toHaveLength(1);
    expect((await preview(clerk, data)).duplicate).toBe(true);
    const [audit] = await db().select().from(auditEvents).where(and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.action, 'stoppage.imported')));
    expect(audit).toBeDefined();
  });

  it('lists the three active stoppages as cases with short car name, links and review reasons', async () => {
    const active = await list(clerk);
    expect(active.counts).toEqual({ active: 3, review: 2, archive: 25 });
    expect(active.items.map((s) => s.noticeNo).sort()).toEqual(['950033', '951570', '951951']);
    expect(active.lastImport).toMatchObject({ fileName: 'stoppage.xlsx', rows: 36 });
    expect(active.stale).toBe(false);

    const linked = await byNotice(clerk, '951570');
    expect(linked).toMatchObject({ vehicleName: 'تارا', chassis: 'SDK82226', ownerName: 'مالک نمونه 21', linkState: 'linked', reception: { admissionNo: 'ST1' }, stage: 'sent_hq', active: true, review: [] });
    expect(linked.vehicleType).toContain('تارا V1P');
    expect(linked.reasons).toEqual(['permit_office', 'special_aid']);
    const items = Object.fromEntries(linked.itemsList.map((i) => [i.partCode ?? '-', i]));
    expect(items['03709152']).toMatchObject({ active: true, stage: 'part_arrived', specialAid: { link: 'linked', arrived: true, emdadNo: '140500872400' } });
    expect(items['06105108']).toMatchObject({ active: true, stage: 'sent_hq', specialAid: { link: 'linked', arrived: false } });
    expect(items['-']).toMatchObject({ active: false, stage: 'ended', reason: 'دریافت مجوز گارانتی ازدفتر', specialAid: null });
    // The phone needs customer.pii.read: masked for the parts clerk, shown to the administrator.
    expect(linked.ownerPhone).toBe('0912***0021');
    expect(((await admin.get(`/stoppages/${linked.id}`).expect(200)).body as StoppageCaseView).ownerPhone).toBe('09120000021');

    const ambiguous = await byNotice(clerk, '951951');
    expect(ambiguous).toMatchObject({ linkState: 'ambiguous', reception: null });
    expect(ambiguous.candidates).toHaveLength(2);
    expect(ambiguous.review.join()).toMatch(/چند پذیرش/);
    expect(ambiguous.review.join()).toMatch(/140500875823/);

    const none = await byNotice(clerk, '950033');
    expect(none.linkState).toBe('none');
    expect(none.itemsList.find((i) => i.reasonKind === 'special_aid')!.specialAid!.link).toBe('not_found');
    expect(none.itemsList.find((i) => i.partCode === '07203037')).toBeDefined();
    expect((await list(clerk, 'review')).items.map((s) => s.noticeNo).sort()).toEqual(['950033', '951951']);
  });

  it('a later file updates rows with a version, keeps rows missing from it, and asks before a large drop', async () => {
    const status = col('وضعیت توقف');
    const end = col('تاریخ خاتمه');
    const later = SAMPLE.filter((r, i) => i === 0 || r[0] === '951570' || r[0] === '949661').map((r, i) => (i > 0 && r[0] === '951570' ? r.map((v, c) => (c === status ? 'خاتمه' : c === end ? '1405/09/05' : v)) : r));
    const data = toXlsx(later);
    const p = await preview(clerk, data);
    // 951570: two active rows end, and the already-ended permit row gets a new end date.
    expect(p).toMatchObject({ rows: 4, changedRows: 3, unchangedRows: 1, newRows: 0, needsAcceptance: true });
    expect(p.missingFromFile).toBe(2); // the active rows of 950033 and 951951
    expect((await apply(clerk, data, p).expect(409)).body.code).toBe('STOPPAGE_WARNINGS');
    await apply(clerk, data, p, true).expect(201);

    const ended = await byNotice(clerk, '951570');
    expect(ended).toMatchObject({ active: false, stage: 'ended', inLastFile: true });
    expect(ended.endedAt).toBe(at('1405/09/05', '00:00').toISOString());
    expect(ended.history.some((x) => x.changes.some((c) => c.includes('وضعیت توقف') && c.includes('خاتمه')))).toBe(true);
    expect(ended.itemsList.filter((i) => i.versions === 2)).toHaveLength(3);
    expect(await db().select().from(stoppageItemVersions).where(eq(stoppageItemVersions.tenantId, tenantId))).toHaveLength(39);

    const kept = await byNotice(clerk, '951951');
    expect(kept).toMatchObject({ active: true, inLastFile: false });
    expect((await list(clerk)).counts).toEqual({ active: 2, review: 2, archive: 26 });
  });

  it('follow-up owner and a manual reception decision are audited, versioned and survive imports', async () => {
    const s = await byNotice(clerk, '951951');
    const followers = (await clerk.get('/stoppages/followers').expect(200)).body as { id: string; displayName: string }[];
    const me = followers.find((f) => f.displayName)!;
    const owned = (await clerk.patch(`/stoppages/${s.id}/follow-up`, { expectedVersion: s.version, ownerUserId: me.id }).expect(200)).body as StoppageCaseView;
    expect(owned.followUpUserId).toBe(me.id);
    await clerk.patch(`/stoppages/${s.id}/follow-up`, { expectedVersion: s.version, ownerUserId: null }).expect(409);
    const wrong = (await db().select({ id: receptions.id }).from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(receptions.chassis, 'SDK82226'))))[0]!.id;
    await clerk.post(`/stoppages/${s.id}/reception`, { expectedVersion: owned.version, receptionId: wrong, reason: 'آزمون شاسی دیگر' }).expect(422);
    const chosen = s.candidates[0]!.id;
    const linked = (await clerk.post(`/stoppages/${s.id}/reception`, { expectedVersion: owned.version, receptionId: chosen, reason: 'پذیرش تاریخ توقف' }).expect(201)).body as StoppageCaseView;
    expect(linked).toMatchObject({ linkState: 'manual', reception: { id: chosen } });
    expect(linked.review.join()).not.toMatch(/چند پذیرش/);
    await h.app.get(StoppagesService).reconcile(db(), tenantId, [s.id]);
    expect((await byNotice(clerk, '951951')).linkState).toBe('manual');
    const actions = (await db().select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.tenantId, tenantId))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['stoppage.follow_up_set', 'stoppage.reception_linked']));
  });

  it('manager report: counts, reasons, stages, ageing and the night-list comparison', async () => {
    const r = (await manager.get('/stoppages/report').expect(200)).body as StoppageReport;
    expect(r.active).toBe(2);
    expect(r.byReason.find((x) => x.kind === 'special_aid')!.count).toBe(2);
    expect(r.byStage.reduce((a, x) => a + x.count, 0)).toBe(2);
    expect(r.ageing.reduce((a, x) => a + x.count, 0)).toBe(2);
    expect(r.overlap).toMatchObject({ both: 0, officialOnly: 2 });
    expect(r.longest).toHaveLength(2);
  });

  it('permissions: the manager reads but cannot import or assign; a guest sees nothing', async () => {
    await manager.get('/stoppages').expect(200);
    await send(manager, toXlsx(SAMPLE), 'fileName=x.xlsx').expect(403);
    await manager.get('/stoppages/followers').expect(403);
    await guest.get('/stoppages').expect(403);
    await guest.get('/stoppages/report').expect(403);
    await admin.get('/stoppages').expect(200);
  });

  // Optional local check against the owner's original anonymised .xlsx (never committed):
  // STOPPAGE_SAMPLE_XLSX=<path> runs it and compares with the CSV-built fixture.
  const real = process.env.STOPPAGE_SAMPLE_XLSX;
  (real ? it : it.skip)('the original export reads exactly like the CSV fixture', () => {
    const service = h.app.get(StoppagesService);
    const a = service.read(new Uint8Array(readFileSync(real!)));
    const b = service.read(toXlsx(SAMPLE));
    expect(a.blocked).toBeNull();
    expect(a.parsed.rows.map((r) => r.official)).toEqual(b.parsed.rows.map((r) => r.official));
  });
});
