import type { CaseDetail, CaseProvenance, Paged, CaseListItem, VehicleImport } from '@manage/shared';
import { eq } from 'drizzle-orm';
import { CasesService } from '../src/cases/cases.service';
import { hashPassword } from '../src/auth/password';
import { newId } from '../src/common/ids';
import { cases, tasks, tenants, users } from '../src/db/schema';
import { readWorkbook } from '../src/parts/xlsx';
import { buildVehicleWorkbook, type SheetRow } from '../src/vehicle-import/sample';
import { Client, createHarness, TEST_PASSWORD, type Harness } from './harness';

// Existing-vehicle Excel import: preview categories, apply, provenance,
// re-import without duplicates, safe updates, mid-apply failure, isolation.

let h: Harness;
let manager: Client;
let expert: Client;

const b64 = (data: Uint8Array) => Buffer.from(data).toString('base64');
let seq = 0;
/** Unique synthetic identifiers per test so tests stay independent. */
const ids = () => {
  seq += 1;
  return { adm: `۷${String(seq).padStart(3, '۰')}۱`, chs: `TS${String(seq).padStart(3, '0')}X` };
};

async function preview(rows: SheetRow[], decisions: object = {}, who: Client = manager, blank = 0) {
  return who.post('/vehicle-imports', {
    fileName: 'آزمون.xlsx',
    fileBase64: b64(buildVehicleWorkbook(rows, blank)),
    decisions,
  });
}
const apply = (id: string, who: Client = manager) => who.post(`/vehicle-imports/${id}/apply`, {});
const row = (imp: VehicleImport, rowNo: number) => imp.rows.find((r) => r.rowNo === rowNo)!;
const caseCount = async () => (await h.db.db.select({ id: cases.id }).from(cases)).length;

const complete = (adm: string, chs: string, extra: SheetRow = {}): SheetRow => ({
  'شماره کارت پذیرش': adm,
  'تاریخ پذیرش': '۱۴۰۵/۰۷/۲۰',
  'ساعت پذیرش (اگر معلوم است)': '۰۹:۱۵',
  'شماره شاسی ثبت‌شده': chs,
  خودرو: 'دنا پلاس',
  'نام مالک': 'مالک آزمون',
  'وضعیت فعلی تعمیر': 'در حال تعمیر',
  ...extra,
});

beforeAll(async () => {
  h = await createHarness();
  [manager, expert] = await Promise.all(['admin', 'expert'].map((u) => h.login(u)));
});
afterAll(async () => {
  await h?.close();
});

describe('existing-vehicle import: preview', () => {
  it('separates new, incomplete, duplicate and error rows and never drops a row silently', async () => {
    const [a, b, c, d, e, f] = [ids(), ids(), ids(), ids(), ids(), ids()];
    const res = await preview(
      [
        complete(a.adm, a.chs, { 'اقدام بعدی': 'صافکاری درب جلو', 'واحد درگیر': 'صافکاری' }),
        complete(b.adm, b.chs, { 'ساعت پذیرش (اگر معلوم است)': '' }),
        complete(c.adm, c.chs),
        complete(c.adm, d.chs),
        complete(e.adm, e.chs, { 'تاریخ پذیرش': '۱۴۰۵/۱۳/۰۱' }),
        complete('بدون پذیرش', f.chs),
        complete('بدون پذیرش', ''),
        complete(ids().adm, ids().chs, { 'وضعیت فعلی تعمیر': 'تحویل‌شده' }),
        complete(ids().adm, ids().chs, { 'وضعیت فعلی تعمیر': '' }),
      ],
      {},
      manager,
      2,
    );
    expect(res.status).toBe(201);
    const imp = res.body as VehicleImport;
    expect(imp).toMatchObject({ status: 'preview', sheetName: 'لیست خودروها', headerRow: 3 });
    expect(imp.rows).toHaveLength(9);
    expect(imp.blankRows).toEqual([13, 14]);
    expect(imp.rows.map((r) => r.outcome)).toEqual([
      'new',
      'incomplete', // date without time, no decision
      'duplicate',
      'duplicate',
      'error', // invalid date
      'new', // "بدون پذیرش" identified by chassis
      'incomplete', // no unique identifier
      'error', // new case cannot be delivered
      'incomplete', // stage not guessed
    ]);
    expect(imp.counts).toMatchObject({ new: 2, incomplete: 3, duplicate: 2, error: 2 });
    expect(row(imp, 5).messages.some((m) => m.text.includes('ساعت پذیرش نامعلوم'))).toBe(true);
    expect(row(imp, 6).messages.some((m) => m.text.includes('تکراری در ردیف‌های 6، 7'))).toBe(true);
    expect(row(imp, 9).messages.some((m) => m.text.includes('شماره پذیرش یکتا نیست'))).toBe(true);
    expect(row(imp, 4).changes.map((c) => c.field)).toEqual(
      expect.arrayContaining(['تاریخ پذیرش', 'مرحله', 'شماره کارت پذیرش', 'شاسی ثبت‌شده', 'وظیفه']),
    );
    expect(row(imp, 4).identity).toBe(`adm:${a.adm.replace(/[۰-۹]/g, (x) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x)))}`);
    // Preview writes nothing to cases.
    expect(await h.db.db.select().from(cases).where(eq(cases.origin, 'excel_import'))).toHaveLength(0);
  });

  it('requires the import permission and rejects files that are not the vehicle list', async () => {
    expect((await preview([complete(ids().adm, ids().chs)], {}, expert)).status).toBe(403);
    const bad = await manager.post('/vehicle-imports', { fileName: 'x.xlsx', fileBase64: b64(new TextEncoder().encode('not a zip')) });
    expect(bad.body.code).toBe('IMPORT_FILE_INVALID');
  });
});

describe('existing-vehicle import: apply and re-import', () => {
  it('creates legacy cases with provenance, then re-importing the same file creates nothing', async () => {
    const [a, b, c] = [ids(), ids(), ids()];
    const rows = [
      complete(a.adm, a.chs, {
        'اقدام بعدی': 'صافکاری گلگیر',
        'واحد درگیر': 'صافکاری',
        'مسئول پیگیری': 'سرپرست نمونه',
        'نوع پوشش تأییدشده': 'کارت طلایی / امداد خودرو',
        'پوشش مندرج در لیست': 'کارت طلایی',
        'توضیحات فعلی — عین برگه': 'متن اولیه برگه آزمون',
        'مانع اصلی': 'قطعه نرسیده',
      }),
      complete(b.adm, b.chs, { 'ساعت پذیرش (اگر معلوم است)': '' }),
      complete('بدون پذیرش', c.chs),
    ];
    const before = await caseCount();
    const p = (await preview(rows, { dateWithoutTime: true })).body as VehicleImport;
    expect(p.counts.new).toBe(3);
    const done = await apply(p.id);
    expect(done.status).toBe(201);
    const imp = done.body as VehicleImport;
    expect(imp.status).toBe('applied');
    expect(await caseCount()).toBe(before + 3);
    expect(imp.rows.every((r) => /^AC-\d{4}-\d{4}$/.test(r.caseNumber ?? ''))).toBe(true);

    const first = (await manager.get(`/cases/${imp.rows[0]!.caseId}`)).body as CaseDetail;
    expect(first).toMatchObject({
      isLegacyEntry: true,
      origin: 'excel_import',
      admissionNo: a.adm, // original text, Persian digits kept
      admittedAtPrecision: 'minute',
      coverageType: 'golden_card',
      coverageNotes: 'کارت طلایی',
      stage: 'in_repair',
      responsible: { displayName: 'سرپرست نمونه' },
    });
    expect(first.vehicle).toMatchObject({ chassisRef: a.chs, vin: null, model: 'دنا پلاس' });
    expect(first.admittedAt).toBe('2026-10-12T05:45:00.000Z'); // 1405/07/20 09:15 Tehran
    expect(first.tasks).toHaveLength(1);
    expect(first.tasks[0]).toMatchObject({ title: 'صافکاری گلگیر', department: { name: 'صافکاری' }, status: 'pending' });
    // Nothing invented: no blocker or part was created from the sheet's text.
    expect(first.blockers).toHaveLength(0);
    const second = (await manager.get(`/cases/${imp.rows[1]!.caseId}`)).body as CaseDetail;
    expect(second.admittedAtPrecision).toBe('date');

    // Provenance: original cells, file and row, for anyone who can read the case.
    const prov = (await expert.get(`/cases/${first.id}/provenance`)).body as CaseProvenance[];
    expect(prov).toHaveLength(1);
    expect(prov[0]).toMatchObject({ fileName: 'آزمون.xlsx', rowNo: 4, outcome: 'new' });
    expect(prov[0]!.source['توضیحات فعلی — عین برگه']).toBe('متن اولیه برگه آزمون');
    expect(prov[0]!.source['مانع اصلی']).toBe('قطعه نرسیده');

    // Admission and chassis numbers are searchable.
    const byAdmission = (await manager.get(`/cases?q=${encodeURIComponent(a.adm)}`)).body as Paged<CaseListItem>;
    expect(byAdmission.items.map((i) => i.id)).toEqual([first.id]);
    expect(((await manager.get(`/cases?q=${c.chs}`)).body as Paged<CaseListItem>).total).toBe(1);

    // Same file again: every row matches its case; nothing is created or duplicated.
    const again = (await preview(rows, { dateWithoutTime: true })).body as VehicleImport;
    expect(again.rows.map((r) => r.outcome)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(again.rows.map((r) => r.caseNumber)).toEqual(imp.rows.map((r) => r.caseNumber));
    await apply(again.id);
    expect(await caseCount()).toBe(before + 3);
    expect(await h.db.db.select().from(tasks).where(eq(tasks.caseId, first.id))).toHaveLength(1);
    expect((await apply(again.id)).body.code).toBe('IMPORT_NOT_PREVIEW');

    // Per-row result with issued case numbers.
    const report = await manager.get(`/vehicle-imports/${imp.id}/report`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(report.status).toBe(200);
    const sheet = readWorkbook(new Uint8Array(report.body as Buffer))[0]!;
    expect(sheet.rows[2]).toContain('شماره پرونده Manage');
    expect(sheet.rows.flat()).toContain(imp.rows[0]!.caseNumber!);
  });

  it('updates only non-empty differences, never clears values, and sends conflicts to review', async () => {
    const [a, b] = [ids(), ids()];
    const created = (await apply((await preview([complete(a.adm, a.chs), complete(b.adm, b.chs)])).body.id)).body as VehicleImport;
    const [caseA, caseB] = created.rows.map((r) => r.caseId!);
    const numberA = created.rows[0]!.caseNumber!;

    const p = (
      await preview([
        // Same vehicle: plate added, owner cell empty (must not clear), stage moved forward.
        complete(a.adm, a.chs, { 'نام مالک': '', 'پلاک (تکمیل شود)': '۱۲ ب ۳۴۵ - ۶۷', 'وضعیت فعلی تعمیر': 'کنترل کیفیت' }),
        // Admission of B but a different admission date: needs a person.
        complete(b.adm, b.chs, { 'تاریخ پذیرش': '۱۴۰۵/۰۷/۲۱' }),
        // Unknown case number.
        complete(ids().adm, ids().chs, { 'شماره پرونده Manage': 'AC-1405-9999' }),
        // Moving to "ready for delivery" is left to the QC workflow.
        complete(ids().adm, ids().chs),
      ])
    ).body as VehicleImport;
    expect(p.rows.map((r) => r.outcome)).toEqual(['update', 'needs_review', 'error', 'new']);
    expect(row(p, 4).changes.map((c) => c.field).sort()).toEqual(['مرحله', 'پلاک'].sort());
    expect(row(p, 5).messages.some((m) => m.text.includes('تاریخ پذیرش فایل'))).toBe(true);
    await apply(p.id);

    // Case number of A with B's admission number (in another file): ambiguous, needs a person.
    const amb = (await preview([complete(b.adm, ids().chs, { 'شماره پرونده Manage': numberA })])).body as VehicleImport;
    expect(amb.rows[0]!.outcome).toBe('needs_review');
    expect(amb.rows[0]!.messages.some((m) => m.text.includes('با پرونده دیگری'))).toBe(true);

    const a2 = (await manager.get(`/cases/${caseA}`)).body as CaseDetail;
    expect(a2.customer?.fullName).toBe('مالک آزمون');
    expect(a2.vehicle.plate).toBe('12 ب 345 - 67'); // stored normalized, as everywhere in Manage
    expect(a2.stage).toBe('quality_control');
    expect(((await manager.get(`/cases/${caseB}`)).body as CaseDetail).admittedAt).toBe('2026-10-12T05:45:00.000Z');

    // The same plate in Persian digits is not a change.
    const ready = (
      await preview([complete(a.adm, a.chs, { 'وضعیت فعلی تعمیر': 'آماده تحویل', 'پلاک (تکمیل شود)': '۱۲ ب ۳۴۵ - ۶۷' })])
    ).body as VehicleImport;
    expect(ready.rows[0]!.outcome).toBe('unchanged');
    expect(ready.rows[0]!.messages.some((m) => m.text.includes('فقط از روند کنترل کیفیت'))).toBe(true);
  });

  it('a failure in the middle keeps finished rows, marks the failed one, and a re-import completes without duplicates', async () => {
    const rows = [ids(), ids(), ids()].map((x) => complete(x.adm, x.chs));
    const before = await caseCount();
    const svc = h.app.get(CasesService);
    const original = svc.create.bind(svc);
    let calls = 0;
    const spy = jest.spyOn(svc, 'create').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('synthetic failure');
      return original(...args);
    });
    const first = (await apply((await preview(rows)).body.id)).body as VehicleImport;
    spy.mockRestore();
    expect(first.status).toBe('partial');
    expect(first.rows.map((r) => r.outcome)).toEqual(['new', 'error', 'new']);
    expect(first.rows[1]!.messages.at(-1)!.text).toContain('ثبت این ردیف ناموفق بود');
    expect(await caseCount()).toBe(before + 2);

    const second = (await preview(rows)).body as VehicleImport;
    expect(second.rows.map((r) => r.outcome)).toEqual(['unchanged', 'new', 'unchanged']);
    await apply(second.id);
    expect(await caseCount()).toBe(before + 3);
  });
});

describe('existing-vehicle import: dealership isolation', () => {
  it('another dealership cannot match, read or apply these imports', async () => {
    const a = ids();
    const mine = (await apply((await preview([complete(a.adm, a.chs)])).body.id)).body as VehicleImport;
    const tenantId = newId();
    await h.db.db.insert(tenants).values({ id: tenantId, code: 'other-import', name: 'نمایندگی دیگر', isTest: true });
    await h.db.db.insert(users).values({
      id: newId(),
      tenantId,
      username: 'manager-other',
      displayName: 'مدیر دیگر',
      passwordHash: await hashPassword(TEST_PASSWORD),
      roles: ['system_admin'],
      isTest: true,
    });
    const other = await h.login('manager-other', 'other-import');
    expect((await other.get(`/vehicle-imports/${mine.id}`)).status).toBe(404);
    expect((await other.get(`/cases/${mine.rows[0]!.caseId}/provenance`)).body).toEqual([]);
    // The same identifiers in the other dealership are a new vehicle there; its case number is unknown there.
    const theirs = (
      await preview([complete(a.adm, a.chs), complete(ids().adm, ids().chs, { 'شماره پرونده Manage': mine.rows[0]!.caseNumber! })], {}, other)
    ).body as VehicleImport;
    expect(theirs.rows.map((r) => r.outcome)).toEqual(['new', 'error']);
    expect(theirs.rows[0]!.caseId).toBeNull();
  });
});
