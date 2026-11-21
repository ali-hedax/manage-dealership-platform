import { createHarness, type Client, type Harness } from './harness';
import { writeSheet } from '../src/parts/xlsx';
import { eq } from 'drizzle-orm';
import { cases } from '../src/db/schema';
import { PrintService } from '../src/print/print.service';

// Smart accident assessment fixes (owner, 2026-11-19): vehicle-verified catalog search,
// 8-digit assessment references with the full code preserved, and a short vehicle name in
// the inspection checklist. Synthetic catalog, VINs TESTVIN… and invented codes only.
let h: Harness;
let admin: Client;
let expert: Client;

async function importSheet(kind: 'parts' | 'customers', rows: string[][], mapping: Record<string, number>) {
  const fileBase64 = Buffer.from(writeSheet('برگه', rows)).toString('base64');
  const preview = await admin.post('/reference-imports', { kind, fileName: `synthetic-${kind}.xlsx`, fileBase64, sheetIndex: 0, headerRow: 1, mapping });
  expect(preview.status).toBe(201);
  expect((await admin.post(`/reference-imports/${preview.body.id}/apply`)).status).toBe(201);
}
async function newCase(vehicle: Record<string, string>) {
  const r = await admin.post('/cases', { admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle, coverageType: 'insurance' });
  expect(r.status).toBe(201);
  return r.body as { id: string };
}
const search = (caseId: string, query: string) => expert.post(`/cases/${caseId}/assessment-catalog/search`, { query });
const codes = (r: { body: { results: { partNumber: string }[] } }) => r.body.results.map((x) => x.partNumber).sort();

beforeAll(async () => {
  h = await createHarness();
  [admin, expert] = await Promise.all([h.login('admin'), h.login('expert')]);
  await importSheet('parts', [
    ['کد فنی', 'نام قطعه', 'مصرف خودرو'],
    ['0021436501', 'سپر جلو', 'دنا'],
    ['0021436502', 'سپر جلو سازنده دوم', 'دنا'],
    ['0055500101', 'سپر جلو', 'دنا پلاس'],
    ['0066600101', 'سپر جلو', 'پژو پارس'],
    ['0077700101', 'گلگیر جلو چپ', 'تارا'],
    ['0088800101', 'بست سپر عمومی', 'خودروهای رایج-صرفنظراز پلتفرم'],
    ['0099900101', 'سپر جلو بدون مصرف', 'نامشخص'],
    ['0012300101', 'کاپوت', 'پژو207'],
    ['0012300201', 'کاپوت', 'پژو 2008'],
    ['0055500201', 'سپر جلو', 'دنا پلاس اتوماتیک توربو'],
    ['0044400101', 'درب موتور', 'رانا'],
    // The catalog names Soren only as «سورن پلاس»: 120 synthetic Soren parts, more than one page.
    ...Array.from({ length: 120 }, (_, i) => [`0033${String(i).padStart(4, '0')}01`, `درب جلو سورن ${i + 1}`, 'سورن پلاس']),
  ], { partNumber: 0, description: 1, vehicleUse: 2 });
  await importSheet('customers', [
    ['VIN', 'مدل', 'تیپ', 'نام'],
    ['TESTVNA0000099001', 'پژو پارس TU5', 'پارس ری استایل', 'مشتری ساختگی'],
    ['TESTVNA0000099002', 'تارا موتور TU5P', 'تارا V1P گیربکس دستی', 'مشتری ساختگی دو'],
    ['TESTVNA0000099003', 'سورن پلاس بنزینی با موتور XU7P', 'سورن پلاس', 'مشتری ساختگی سه'],
    ['TESTVNA0000099004', 'دنا پلاس موتور EF7PNA', 'دناپلاس', 'مشتری ساختگی چهار'],
    ['TESTVNA0000099005', 'دنا پلاس موتور EF7PNA', 'دناپلاس', 'مشتری ساختگی پنج'],
  ], { vin: 0, model: 1, trim: 2, fullName: 3 });
});
afterAll(async () => { await h?.close(); });

describe('vehicle-specific catalog search', () => {
  it('returns only the case family and explicitly common parts — never another vehicle', async () => {
    const plus = await newCase({ brand: 'ایران خودرو', model: 'دنا پلاس موتور EF7PNA', trim: '7090401 دناپلاس با موتور EF7PNA، گیربکس 6 دنده دستی' });
    const r = await search(plus.id, 'سپر');
    expect(r.status).toBe(201);
    expect(r.body.fitmentVerified).toBe(true);
    // The whole Dena family is offered; only the exact «دنا پلاس» label (and common parts) without a trim check.
    expect(codes(r)).toEqual(['0021436501', '0021436502', '0055500101', '0055500201', '0088800101']);
    expect(r.body).toMatchObject({ family: 'دنا', caseVehicle: 'دنا پلاس موتور EF7PNA', trimReview: false });
    const note = (code: string) => r.body.results.find((x: { partNumber: string }) => x.partNumber === code)?.fitmentNote ?? null;
    expect([note('0055500101'), note('0088800101')]).toEqual([null, null]);
    expect([note('0021436501'), note('0055500201')]).toEqual(['نیازمند بررسی تطابق با تیپ خودرو', 'نیازمند بررسی تطابق با تیپ خودرو']);
    // The exact label ranks before other trims of the family.
    expect(r.body.results[0].partNumber).toBe('0055500101');

    const dena = await newCase({ model: 'دنا' });
    const d = await search(dena.id, 'سپر');
    expect(codes(d)).toEqual(['0021436501', '0021436502', '0055500101', '0055500201', '0088800101']);
    expect(d.body.results.filter((x: { fitmentNote: string | null }) => x.fitmentNote).map((x: { partNumber: string }) => x.partNumber).sort()).toEqual(['0055500101', '0055500201']);
    // A code of another vehicle is not offered even when typed exactly.
    expect(codes(await search(dena.id, '0066600101'))).toEqual([]);
    // «207» is matched as a whole number only, and only for its own family.
    const p207 = await newCase({ model: '207', trim: '6001014 پژو 207 P7L پاناروما' });
    expect(codes(await search(p207.id, 'کاپوت'))).toEqual(['0012300101']);
    expect(codes(await search(dena.id, 'کاپوت'))).toEqual([]);
    // «207i» and «پژو ۲۰۷ اتوماتیک» are the 207 family; «2008» stays its own car.
    for (const model of ['پژو 207i HB موتور TU5 گیربکس دستی 5 دنده', 'پژو ۲۰۷ اتوماتیک پانوراما']) {
      const c = await newCase({ model });
      const s = await search(c.id, 'کاپوت');
      expect(codes(s)).toEqual(['0012300101']);
      expect(s.body.family).toBe('پژو 207');
    }
  });

  it('a trim suffix never hides the family: «سورن ELX» gets the Soren parts with a trim check, up to 100', async () => {
    const elx = await newCase({ model: 'سورن ELX با موتورEF7 بنزینی' });
    const s = await search(elx.id, 'درب جلو');
    expect(s.body).toMatchObject({ fitmentVerified: true, family: 'سورن', caseVehicle: 'سورن ELX با موتورEF7 بنزینی', trimReview: true });
    expect(s.body.results).toHaveLength(100);
    expect(s.body.results.every((x: { vehicleUse: string; fitmentNote: string }) => x.vehicleUse === 'سورن پلاس' && x.fitmentNote === 'نیازمند بررسی تطابق با تیپ خودرو')).toBe(true);
    // Never another car's part.
    expect(codes(await search(elx.id, 'درب موتور'))).toEqual([]);
    expect(codes(await search(elx.id, 'سپر'))).toEqual(['0088800101']);
    // The exact trim needs no check.
    const plus = await newCase({ model: 'سورن پلاس' });
    const p = await search(plus.id, 'درب جلو');
    expect(p.body.results).toHaveLength(100);
    expect(p.body.results.every((x: { fitmentNote: string | null }) => x.fitmentNote === null)).toBe(true);
    // Unrelated look-alikes are not a family.
    for (const model of ['ستارا', 'پژو 2007']) {
      const u = await newCase({ model });
      expect((await search(u.id, 'سپر')).body).toMatchObject({ fitmentVerified: false, results: [] });
    }
  });

  it('VIN record of another trim of the same family is not a conflict; another family still is', async () => {
    const sameFamily = await newCase({ model: 'سورن ELX', vin: 'TESTVNA0000099003' });
    const a = await search(sameFamily.id, 'درب جلو');
    expect(a.body.fitment).toMatchObject({ status: 'verified', source: 'case+vin', familyName: 'سورن' });
    expect(a.body.results.length).toBeGreaterThan(20);
    // Case «دنا» but the VIN record says «دنا پلاس»: same family, every part asks for a trim check.
    const trims = await newCase({ model: 'دنا', vin: 'TESTVNA0000099004' });
    const b = await search(trims.id, 'سپر');
    expect(b.body).toMatchObject({ fitmentVerified: true, family: 'دنا', trimReview: true });
    expect(b.body.results.filter((x: { fitmentNote: string | null }) => !x.fitmentNote).map((x: { partNumber: string }) => x.partNumber)).toEqual(['0088800101']);
    const other = await newCase({ model: 'سورن ELX', vin: 'TESTVNA0000099005' });
    expect((await search(other.id, 'سپر')).body).toMatchObject({ fitmentVerified: false, results: [], fitment: { status: 'conflict' } });
  });

  it('shows nothing when the vehicle cannot be verified, or when the VIN record disagrees', async () => {
    const unknown = await newCase({ model: 'خودروی نامعلوم' });
    const u = await search(unknown.id, 'سپر');
    expect(u.body).toMatchObject({ fitmentVerified: false, results: [] });
    expect(u.body.fitment.status).toBe('unresolved');
    expect(u.body.message).toContain('قابل تشخیص نیست');

    const conflict = await newCase({ model: 'تارا', vin: 'TESTVNA0000099001' });
    const c = await search(conflict.id, 'سپر');
    expect(c.body).toMatchObject({ fitmentVerified: false, results: [] });
    expect(c.body.fitment.status).toBe('conflict');

    // No model on the case: the dealership's admission record of the same VIN decides.
    const byVin = await newCase({ vin: 'TESTVNA0000099002' });
    const v = await search(byVin.id, 'گلگیر');
    expect(v.body.fitment).toMatchObject({ status: 'verified', source: 'vin' });
    expect(codes(v)).toEqual(['0077700101']);
    expect(codes(await search(byVin.id, 'سپر'))).toEqual(['0088800101']);
  });
});

describe('8-digit assessment reference', () => {
  it('saves the first 8 digits as the line code, keeps the full code, and blocks the same reference twice', async () => {
    const kase = await newCase({ model: 'دنا' });
    const draft = await expert.post(`/cases/${kase.id}/assessments`, { kind: 'initial', smartManual: true, assessorName: 'کارشناس ساختگی' });
    expect(draft.status).toBe(201);
    let version = draft.body.version as number;
    const add = async (body: Record<string, unknown>) => {
      const r = await expert.post(`/assessments/${draft.body.id}/items`, { action: 'replace', quantity: 1, expectedVersion: version, ...body });
      if (r.status === 201) version = r.body.version;
      return r;
    };
    const a = await add({ description: 'سپر جلو', partNumber: '0021436501', sourcePartNumber: '۰۰۲۱-۴۳۶۵۰۱' });
    expect(a.status).toBe(201);
    expect(a.body.items[0]).toMatchObject({ partNumber: '00214365', sourcePartNumber: '0021436501' });
    // Another supplier code and a longer market code with the same 8 digits are the same assessment line.
    expect((await add({ description: 'سپر جلو سازنده دوم', sourcePartNumber: '0021436502' })).status).toBe(422);
    expect((await add({ description: 'سپر بازار', sourcePartNumber: '00214365789AB' })).status).toBe(422);
    // A code without an 8-digit start is kept whole.
    const b = await add({ description: 'قطعهٔ کد حرفی', sourcePartNumber: 'ab-1234' });
    expect(b.body.items.find((i: { description: string }) => i.description === 'قطعهٔ کد حرفی')).toMatchObject({ partNumber: 'AB1234', sourcePartNumber: 'AB1234' });
    // A line entered the old way (no catalog pick) keeps its full code untouched.
    const c = await add({ description: 'چراغ دستی', partNumber: '0031313101' });
    expect(c.body.items.find((i: { description: string }) => i.description === 'چراغ دستی')).toMatchObject({ partNumber: '0031313101', sourcePartNumber: null });
    // Quantity edit keeps both codes.
    const line = c.body.items.find((i: { partNumber: string }) => i.partNumber === '00214365');
    const q = await expert.patch(`/assessment-items/${line.id}`, { quantity: 3, expectedVersion: version });
    expect(q.status).toBe(200);
    expect(q.body.items.find((i: { id: string }) => i.id === line.id)).toMatchObject({ quantity: 3, partNumber: '00214365', sourcePartNumber: '0021436501' });
  });
});

describe('inspection checklist', () => {
  it('prints only the vehicle name, never the long manufacturer trim text', async () => {
    const long = '3220901 تارا V1P با موتور TU5P ، گیربکس MT6دستی ،EMS&IMMO:SSAT، ترمز ABS&ESC: YUFIN ، ایربگ ایمن خودرو ، یورو 5';
    const kase = await newCase({ model: 'تارا موتور TU5P', trim: long, plate: '۱۲ ب ۳۴۵ - ۶۷' });
    const me = (await expert.get('/auth/me')).body;
    const [{ t }] = await h.db.db.select({ t: cases.tenantId }).from(cases).where(eq(cases.id, kase.id));
    const actor = { user: { ...me, permissions: new Set(me.permissions), tenantId: t } } as never;
    const { rows } = await h.app.get(PrintService).inspectionRows(actor);
    const row = rows.find((r) => r.cells[3] === '۱۲ ب ۳۴۵ - ۶۷' || r.cells[2] === 'تارا');
    expect(row).toBeDefined();
    expect(row!.cells[2]).toBe('تارا');
    expect(rows.every((r) => !r.cells[2]!.includes('YUFIN'))).toBe(true);
    const pdf = await expert.get('/print/inspection.pdf').buffer(true).parse((res, cb) => { const d: Buffer[] = []; res.on('data', (x: Buffer) => d.push(x)); res.on('end', () => cb(null, Buffer.concat(d))); });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(kase.id).toBeTruthy();
  });
});
