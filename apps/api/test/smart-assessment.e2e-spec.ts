import { createHarness, type Client, type Harness } from './harness';
import { writeSheet } from '../src/parts/xlsx';

let h: Harness;
let admin: Client;
let expert: Client;
let clerk: Client;

beforeAll(async () => {
  h = await createHarness();
  [admin, expert, clerk] = await Promise.all([h.login('admin'), h.login('expert'), h.login('parts')]);
});
afterAll(async () => { await h?.close(); });

it('searches real imported catalog by Persian phrase, code and case model, then saves assessment lines', async () => {
  const workbook = Buffer.from(writeSheet('قطعات', [
    ['کد فنی', 'نام قطعه', 'مصرف خودرو'],
    ['00123001', 'سپر جلو ری را', 'ری را'],
    ['00123002', 'دیاق سپر جلو', 'ری را'],
    ['00123003', 'چراغ عقب دنا', 'دنا'],
  ])).toString('base64');
  const preview = await admin.post('/reference-imports', {
    kind: 'parts', fileName: 'synthetic-assessment-catalog.xlsx', fileBase64: workbook,
    sheetIndex: 0, headerRow: 1,
    mapping: { partNumber: 0, description: 1, vehicleUse: 2 },
  });
  expect(preview.status).toBe(201);
  expect((await admin.post(`/reference-imports/${preview.body.id}/apply`)).status).toBe(201);

  const kase = await admin.post('/cases', {
    admittedAt: new Date(Date.now() - 86_400_000).toISOString(),
    vehicle: { brand: 'ایران خودرو', model: 'ری را', trim: 'تیپ آزمون' },
    coverageType: 'insurance',
  });
  expect(kase.status).toBe(201);
  const caseId = kase.body.id as string;
  const suggestionPath = `/cases/${caseId}/assessment-catalog/search`;

  const searched = await expert.post(suggestionPath, { query: 'سپر' });
  expect(searched.status).toBe(201);
  expect(searched.body.fitmentVerified).toBe(false);
  expect(searched.body.vehicle.model).toBe('ری را');
  expect(searched.body.results.map((r: {partNumber: string}) => r.partNumber)).toEqual(['00123001', '00123002']);
  expect(searched.body.results[0].requiresFitmentReview).toBe(true);

  const codeSearch = await expert.post(suggestionPath, { query: '۰۰۱۲۳۰۰۲' });
  expect(codeSearch.status).toBe(201);
  expect(codeSearch.body.results[0].partNumber).toBe('00123002');

  const draft = await expert.post(`/cases/${caseId}/assessments`, { kind: 'initial', assessorName: 'کارشناس ساختگی' });
  expect(draft.status).toBe(201);
  const a = draft.body;
  const item1 = await expert.post(`/assessments/${a.id}/items`, {
    action: 'replace', description: searched.body.results[0].name, partNumber: '00123001',
    quantity: 1, expectedVersion: a.version,
  });
  expect(item1.status).toBe(201);
  const versions = await expert.get(`/cases/${caseId}/assessments`);
  const latest = versions.body.at(-1);
  expect(latest.items).toEqual(expect.arrayContaining([expect.objectContaining({ partNumber: '00123001' })]));
  const item2 = await expert.post(`/assessments/${a.id}/items`, {
    action: 'replace', description: searched.body.results[1].name, partNumber: '00123002',
    quantity: 2, expectedVersion: latest.version,
  });
  expect(item2.status).toBe(201);
  const persisted = await expert.get(`/cases/${caseId}/assessments`);
  expect(persisted.body.at(-1).items.filter((i: {partNumber:string}) => i.partNumber.startsWith('00123'))).toHaveLength(2);
});

it('rejects readers without assessment permission and unknown cases without disclosing catalog data', async () => {
  const denied = await clerk.post('/cases/00000000-0000-4000-8000-000000000001/assessment-catalog/search', {query:'سپر'});
  expect(denied.status).toBe(403);
  const unknown = await expert.post('/cases/00000000-0000-4000-8000-000000000001/assessment-catalog/search', {query:'سپر'});
  expect(unknown.status).toBe(404);
  const short = await expert.post('/cases/00000000-0000-4000-8000-000000000001/assessment-catalog/search', {query:'س'});
  expect([404,422]).toContain(short.status);
});
