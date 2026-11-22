import { isacoHeaderIndex } from '@manage/shared';
import { writeSheet } from '../src/parts/xlsx';
import { createHarness, daysAgo, type Client, type Harness } from './harness';

// Owner, 2026-11-19: «کد محصول ایساکو» from the customer-history import (exact VIN/chassis only,
// kept as a string with leading zeros, never guessed) and the manual «افزودن قطعه» requiring
// both the part name and its technical code. Synthetic VINs and codes only.
let h: Harness;
let admin: Client;
let expert: Client;
beforeAll(async () => {
  h = await createHarness();
  [admin, expert] = await Promise.all([h.login('admin'), h.login('expert')]);
});
afterAll(async () => h?.close());

async function importHistory(rows: string[][]) {
  const fileBase64 = Buffer.from(writeSheet('لیست پذیرش ها', [['VIN', 'شماره شاسی', 'مدل', 'نام', 'کد محصول ایساکو'], ...rows])).toString('base64');
  const preview = await admin.post('/reference-imports', { kind: 'customers', fileName: 'synthetic-history.xlsx', fileBase64, sheetIndex: 0, headerRow: 1, mapping: { vin: 0, chassis: 1, model: 2, fullName: 3, isacoCode: 4 } });
  expect(preview.status).toBe(201);
  expect((await admin.post(`/reference-imports/${preview.body.id}/apply`)).status).toBe(201);
}
const newCase = async (vehicle: Record<string, string>) => (await expert.post('/cases', { isLegacyEntry: true, vehicle, admittedAt: daysAgo(1), coverageType: 'personal' })).body as { id: string };

describe('ISACO product code', () => {
  it('suggests the column from its header variants', () => {
    expect(isacoHeaderIndex(['VIN', 'مدل', 'كد محصول ايساكو'])).toBe(2);
    expect(isacoHeaderIndex(['VIN', 'ISACO Product Code'])).toBe(1);
    expect(isacoHeaderIndex(['VIN', 'مدل'])).toBe(-1);
  });

  it('finds an ISACO code on an old case created before the customer-history import', async () => {
    const historical = await newCase({ model: 'سورن', vin: 'TESTVNA0000077111' });
    expect((await expert.get(`/cases/${historical.id}`)).body.vehicle.isacoCode).toBeNull();
    await importHistory([
      ['TESTVNA0000077111', '', 'سورن', 'مشتری قدیمی ساختگی', '0007788'],
    ]);
    const updated = await expert.get(`/cases/${historical.id}`);
    expect(updated.status).toBe(200);
    expect(updated.body.vehicle).toMatchObject({isacoCode:'0007788',isacoCodeConflict:false});
  });

  it('shows the code of this exact VIN/chassis only, keeps leading zeros, ignores blanks and refuses conflicts', async () => {
    await importHistory([
      ['TESTVNA0000077001', '', 'دنا پلاس', 'مشتری ساختگی یک', '0012345'],
      ['TESTVNA0000077001', '', 'دنا پلاس', 'مشتری ساختگی یک — مراجعهٔ دوم', ''],
      ['', 'CHS77002', 'تارا', 'مشتری ساختگی دو', '۰۰۹۸۷'],
      ['TESTVNA0000077003', '', 'رانا', 'مشتری ساختگی سه', '111'],
      ['TESTVNA0000077003', '', 'رانا', 'مشتری ساختگی سه', '222'],
    ]);
    const byVin = await newCase({ model: 'دنا پلاس', vin: 'TESTVNA0000077001' });
    expect((await expert.get(`/cases/${byVin.id}`)).body.vehicle).toMatchObject({ isacoCode: '0012345', isacoCodeConflict: false });
    const byChassis = await newCase({ model: 'تارا', vin: 'TESTVNA0000077099' });
    expect((await expert.get(`/cases/${byChassis.id}`)).body.vehicle.isacoCode).toBeNull();
    const conflict = await newCase({ model: 'رانا', vin: 'TESTVNA0000077003' });
    expect((await expert.get(`/cases/${conflict.id}`)).body.vehicle).toMatchObject({ isacoCode: null, isacoCodeConflict: true });
    // Another vehicle never receives this code.
    const other = await newCase({ model: 'دنا پلاس', vin: 'TESTVNA0000077004' });
    expect((await expert.get(`/cases/${other.id}`)).body.vehicle.isacoCode).toBeNull();
  });
});

describe('manual «افزودن قطعه»', () => {
  it('requires both the part name and its technical code; codes stay strings', async () => {
    const c = await newCase({ model: 'دنا' });
    const add = (body: Record<string, unknown>) => expert.post(`/cases/${c.id}/parts`, { quantity: 1, source: 'company', ...body });
    expect((await add({ description: 'سپر جلو' })).status).toBe(400);
    expect((await add({ description: 'سپر جلو', partNumber: '   ' })).status).toBe(400);
    expect((await add({ description: '  ', partNumber: '0012345678' })).status).toBe(400);
    const long = '00214365789ABCDEF0123';
    const ok = await add({ description: '  چراغ بازار  ', partNumber: `  ${long}  ` });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ description: 'چراغ بازار', partNumber: long });
    const zeros = await add({ description: 'گلگیر', partNumber: '0000123' });
    expect(zeros.body.partNumber).toBe('0000123');
    expect((await add({ description: 'بیش از حد', partNumber: '1'.repeat(81) })).status).toBe(400);
  });
});
