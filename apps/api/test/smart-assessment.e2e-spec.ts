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
  expect(searched.body.fitmentVerified).toBe(true);
  expect(searched.body.vehicle.model).toBe('ری را');
  expect(searched.body.results.map((r: {partNumber: string}) => r.partNumber)).toEqual(['00123001', '00123002']);
  expect(searched.body.results[0].requiresFitmentReview).toBe(false);

  const codeSearch = await expert.post(suggestionPath, { query: '۰۰۱۲۳۰۰۲' });
  expect(codeSearch.status).toBe(201);
  expect(codeSearch.body.results[0].partNumber).toBe('00123002');

  const draft = await expert.post(`/cases/${caseId}/assessments`, { kind: 'initial', smartManual:true, assessorName: 'کارشناس ساختگی' });
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

it('shows 25 verified vehicle-specific results rather than stopping at 20', async () => {
  const rows = Array.from({length:25},(_,i)=>[String(98760000+i), `سپر محدودیت کارشناسی ${i+1}`, 'ری را']);
  const workbook = Buffer.from(writeSheet('قطعات', [
    ['کد فنی','نام قطعه','مصرف خودرو'], ...rows,
  ])).toString('base64');
  const preview = await admin.post('/reference-imports', {
    kind:'parts',fileName:'assessment-limit-25.xlsx',fileBase64:workbook,
    sheetIndex:0,headerRow:1,mapping:{partNumber:0,description:1,vehicleUse:2},
  });
  expect(preview.status).toBe(201);
  expect((await admin.post(`/reference-imports/${preview.body.id}/apply`)).status).toBe(201);
  const kase = await admin.post('/cases',{
    admittedAt:new Date(Date.now()-86400000).toISOString(),
    vehicle:{model:'ری را'},coverageType:'insurance',
  });
  expect(kase.status).toBe(201);
  const response = await expert.post(`/cases/${kase.body.id}/assessment-catalog/search`,{
    query:'سپر محدودیت کارشناسی',
  });
  expect(response.status).toBe(201);
  expect(response.body.fitmentVerified).toBe(true);
  expect(response.body.results.filter((r:{partNumber:string})=>/^987600[0-2][0-9]$/.test(r.partNumber))).toHaveLength(25);
});

it('rejects readers without assessment permission and unknown cases without disclosing catalog data', async () => {
  const denied = await clerk.post('/cases/00000000-0000-4000-8000-000000000001/assessment-catalog/search', {query:'سپر'});
  expect(denied.status).toBe(403);
  const unknown = await expert.post('/cases/00000000-0000-4000-8000-000000000001/assessment-catalog/search', {query:'سپر'});
  expect(unknown.status).toBe(404);
  const short = await expert.post('/cases/00000000-0000-4000-8000-000000000001/assessment-catalog/search', {query:'س'});
  expect([400,404,422]).toContain(short.status);
});

it('persists independent parts-clerk decisions and audit, requires reason, blocks stale updates and rechecks edited codes', async () => {
  const kase = await admin.post('/cases', {
    admittedAt: new Date(Date.now()-86400000).toISOString(),
    vehicle: {model:'ری را'},coverageType:'insurance',
  });
  expect(kase.status).toBe(201);
  const caseId=kase.body.id as string;
  const created=await expert.post(`/cases/${caseId}/assessments`,{kind:'initial',smartManual:true,assessorName:'کارشناس آزمایشی'});
  expect(created.status).toBe(201);
  const a=created.body;
  const first=await expert.post(`/assessments/${a.id}/items`,{
    expectedVersion:a.version,action:'replace',description:'سپر تست',partNumber:'100001',quantity:1,
  });
  expect(first.status).toBe(201);
  const second=await expert.post(`/assessments/${a.id}/items`,{
    expectedVersion:first.body.version,action:'replace',description:'چراغ تست',partNumber:'100002',quantity:1,
  });
  expect(second.status).toBe(201);
  let review=await clerk.get(`/cases/${caseId}/technical-reviews`);
  expect(review.status).toBe(200);
  expect(review.body).toHaveLength(2);
  const [p1,p2]=review.body;
  expect(p1.status).toBe('pending');
  expect((await expert.post(`/assessment-items/${p1.itemId}/technical-review`,{action:'accept',expectedVersion:1})).status).toBe(403);
  expect((await clerk.post(`/assessment-items/${p1.itemId}/technical-review`,{action:'return',expectedVersion:1})).status).toBe(422);
  const accepted=await clerk.post(`/assessment-items/${p1.itemId}/technical-review`,{action:'accept',expectedVersion:1});
  expect(accepted.status).toBe(201);
  expect((await clerk.post(`/assessment-items/${p1.itemId}/technical-review`,{action:'return',reason:'اشتباه',expectedVersion:1})).status).toBe(409);
  const returned=await clerk.post(`/assessment-items/${p2.itemId}/technical-review`,{
    action:'return',reason:'شماره فنی برای این خودرو اشتباه است',expectedVersion:1,
  });
  expect(returned.status).toBe(201);
  review=await expert.get(`/cases/${caseId}/technical-reviews`);
  expect(review.body.map((r:{status:string})=>r.status)).toEqual(['accepted','returned']);
  expect(review.body[1].reason).toMatch(/اشتباه/);
  const afterEdit=await expert.patch(`/assessment-items/${p2.itemId}`,{
    expectedVersion:second.body.version,partNumber:'100003',
  });
  expect(afterEdit.status).toBe(200);
  review=await clerk.get(`/cases/${caseId}/technical-reviews`);
  expect(review.body[0].status).toBe('accepted');
  expect(review.body[1].status).toBe('pending');
  expect(review.body[1].reason).toBeNull();
  expect(review.body[1].version).toBe(3);
  expect((await clerk.post(`/assessment-items/${p2.itemId}/technical-review`,{
    action:'accept',expectedVersion:3,
  })).status).toBe(201);
});

it('allows every non-Golden Card coverage, including mixed and unknown, but rejects Golden Card', async () => {
  for (const coverageType of ['insurance', 'personal', 'mixed', 'unknown', 'golden_card'] as const) {
    const created = await admin.post('/cases', {
      admittedAt: new Date(Date.now() - 86_400_000).toISOString(),
      vehicle: { model: 'سورن' },
      coverageType,
    });
    expect(created.status).toBe(201);
    const result = await expert.post(`/cases/${created.body.id}/assessments`, {
      kind: 'initial', smartManual: true, assessorName: 'کارشناس آزمون',
    });
    if (coverageType === 'golden_card') {
      expect(result.status).toBe(422);
      expect(result.body.code).toBe('SMART_ASSESSMENT_COVERAGE');
    } else {
      expect(result.status).toBe(201);
      expect(result.body.smartManual).toBe(true);
    }
  }
});
