import { createHarness, TEST_PASSWORD, type Client, type Harness } from './harness';
import { writeSheet } from '../src/parts/xlsx';
import { newId } from '../src/common/ids';
import { hashPassword } from '../src/auth/password';
import { tenants, users } from '../src/db/schema';

// Smart assessment search scopes (owner, 2026-11-22): case vehicle (default), one chosen
// catalog vehicle, or every vehicle. Synthetic catalog and invented codes only.
let h: Harness;
let admin: Client;
let expert: Client;
const OTHER = 'خودروی دیگر؛ سازگاری با خودروی پرونده تأیید نشده و نیازمند بررسی فنی است';
const TRIM = 'نیازمند بررسی تطابق با تیپ خودرو';
type Result = { id: string; partNumber: string; reference: string | null; vehicleUse: string; vehicleFamily: string | null; compatibility: string; fitmentNote: string | null };

async function importParts(rows: string[][]) {
  const fileBase64 = Buffer.from(writeSheet('برگه', [['کد فنی', 'نام قطعه', 'مصرف خودرو'], ...rows])).toString('base64');
  const preview = await admin.post('/reference-imports', { kind: 'parts', fileName: 'synthetic-scope.xlsx', fileBase64, sheetIndex: 0, headerRow: 1, mapping: { partNumber: 0, description: 1, vehicleUse: 2 } });
  expect(preview.status).toBe(201);
  expect((await admin.post(`/reference-imports/${preview.body.id}/apply`)).status).toBe(201);
}
async function newCase(model: string) {
  const r = await admin.post('/cases', { admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle: { model }, coverageType: 'insurance' });
  expect(r.status).toBe(201);
  return r.body.id as string;
}
const search = (caseId: string, body: Record<string, unknown>, as: Client = expert) => as.post(`/cases/${caseId}/assessment-catalog/search`, body);
const codes = (r: { body: { results: Result[] } }) => r.body.results.map((x) => x.partNumber).sort();
const byCode = (r: { body: { results: Result[] } }, code: string) => r.body.results.find((x) => x.partNumber === code);

beforeAll(async () => {
  h = await createHarness();
  [admin, expert] = await Promise.all([h.login('admin'), h.login('expert')]);
  await importParts([
    ['0031100101', 'سپر جلو', 'سورن پلاس'],
    ['0031200101', 'سپر جلو', 'سمند'],
    ['0031200201', 'درب عقب چپ', 'سمند'],
    ['0031300101', 'سپر جلو', 'پژو 206'],
    ['0031400101', 'بست سپر عمومی', 'خودروهای رایج-صرفنظراز پلتفرم'],
    ['0031500101', 'سپر جلو بدون مصرف', 'نامشخص'],
    ['0031600101', 'آینه بغل چپ', 'سورن پلاس'],
    // 130 matches of one name across three vehicles: more than one page in «همه خودروها».
    ...Array.from({ length: 130 }, (_, i) => [`0032${String(i).padStart(4, '0')}01`, `گلگیر آزمون ${i + 1}`, ['سمند', 'سورن پلاس', 'تارا'][i % 3]!]),
  ]);
});
afterAll(async () => { await h?.close(); });

describe('three search scopes for a «سورن ELX» case', () => {
  it('defaults to the case family, switches to Samand and back, and never changes the case vehicle', async () => {
    const caseId = await newCase('سورن ELX');
    const before = (await admin.get(`/cases/${caseId}`)).body;

    // Mode A (default, and explicit): only the Soren family plus explicitly common parts.
    const a = await search(caseId, { query: 'سپر' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ scope: 'case', fitmentVerified: true, family: 'سورن', caseVehicle: 'سورن ELX', scopeFamily: { name: 'سورن' } });
    expect(codes(a)).toEqual(['0031100101', '0031400101']);
    expect(byCode(a, '0031100101')).toMatchObject({ compatibility: 'trim-review', fitmentNote: TRIM, vehicleFamily: 'سورن', reference: '00311001' });
    expect(byCode(a, '0031400101')).toMatchObject({ compatibility: 'verified', fitmentNote: null, vehicleFamily: null });
    expect(codes(await search(caseId, { query: 'سپر', scope: 'case' }))).toEqual(codes(a));

    // The picker lists the families of the real catalog, the case family first.
    const v = await expert.get(`/cases/${caseId}/assessment-catalog/vehicles`);
    expect(v.status).toBe(200);
    expect(v.body.caseFamily).toMatchObject({ name: 'سورن' });
    expect(v.body.families[0]).toMatchObject({ name: 'سورن', caseFamily: true, labels: ['سورن پلاس'] });
    const samand = v.body.families.find((f: { name: string }) => f.name === 'سمند');
    expect(samand).toMatchObject({ labels: ['سمند'], parts: 2 + 44, caseFamily: false });
    expect(v.body.families.map((f: { name: string }) => f.name)).toEqual(expect.arrayContaining(['سورن', 'سمند', 'پژو 206', 'تارا']));
    // Common and unlabelled parts are not a vehicle.
    expect(v.body.families.some((f: { labels: string[] }) => f.labels.some((l) => l === 'نامشخص' || l.startsWith('خودروهای رایج')))).toBe(false);

    // Mode B: the Samand catalog — potentially compatible, never certified for the Soren case.
    const b = await search(caseId, { query: 'سپر', scope: 'vehicle', family: samand.key });
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({ scope: 'vehicle', scopeFamily: { key: samand.key, name: 'سمند' }, family: 'سورن' });
    expect(codes(b)).toEqual(['0031200101', '0031400101']);
    expect(byCode(b, '0031200101')).toMatchObject({ compatibility: 'other-family', fitmentNote: OTHER, vehicleFamily: 'سمند', vehicleUse: 'سمند', reference: '00312001' });
    // Search by part number inside the chosen vehicle.
    expect(codes(await search(caseId, { query: '0031200201', scope: 'vehicle', family: samand.key }))).toEqual(['0031200201']);
    // Choosing the case's own family behaves like mode A.
    const own = await search(caseId, { query: 'سپر', scope: 'vehicle', family: v.body.caseFamily.key });
    expect(byCode(own, '0031100101')).toMatchObject({ compatibility: 'trim-review' });

    // Back to the case vehicle: same results as before.
    expect(codes(await search(caseId, { query: 'سپر' }))).toEqual(['0031100101', '0031400101']);
    // A name starting with «آ» is found whether typed with «آ» or «ا».
    expect(codes(await search(caseId, { query: 'آینه بغل' }))).toEqual(['0031600101']);
    expect(codes(await search(caseId, { query: 'اینه' }))).toEqual(['0031600101']);
    // Another vehicle's code is still not offered in mode A.
    expect(codes(await search(caseId, { query: '0031200101' }))).toEqual([]);

    // Searching never touches the case or its vehicle.
    const after = (await admin.get(`/cases/${caseId}`)).body;
    expect(after.vehicle).toEqual(before.vehicle);
    expect(after.version).toBe(before.version);
  });

  it('mode C searches every vehicle by name and number, shows the source vehicle, and pages past 100', async () => {
    const caseId = await newCase('سورن ELX');
    const c = await search(caseId, { query: 'سپر', scope: 'all' });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ scope: 'all', scopeFamily: null, hasMore: false, offset: 0 });
    expect(codes(c)).toEqual(['0031100101', '0031200101', '0031300101', '0031400101', '0031500101']);
    expect(byCode(c, '0031300101')).toMatchObject({ vehicleFamily: 'پژو 206', compatibility: 'other-family', fitmentNote: OTHER });
    expect(byCode(c, '0031500101')).toMatchObject({ vehicleFamily: null, compatibility: 'unknown' });
    // Verified and same-family parts rank before other vehicles; nothing else is certified.
    expect(c.body.results.slice(0, 2).map((x: Result) => x.partNumber).sort()).toEqual(['0031100101', '0031400101']);
    expect(c.body.results.filter((x: Result) => x.compatibility === 'verified').map((x: Result) => x.partNumber)).toEqual(['0031400101']);
    expect(codes(await search(caseId, { query: '0031300101', scope: 'all' }))).toEqual(['0031300101']);

    const p1 = await search(caseId, { query: 'گلگیر آزمون', scope: 'all' });
    expect(p1.body).toMatchObject({ total: 130, hasMore: true, limited: false });
    expect(p1.body.results).toHaveLength(100);
    const p2 = await search(caseId, { query: 'گلگیر آزمون', scope: 'all', offset: 100 });
    expect(p2.body).toMatchObject({ total: 130, hasMore: false, offset: 100 });
    expect(p2.body.results).toHaveLength(30);
    const ids = new Set([...p1.body.results, ...p2.body.results].map((x: Result) => x.id));
    expect(ids.size).toBe(130);
    // The case family's parts come first; the other vehicles follow, each marked.
    expect(p1.body.results.slice(0, 43).every((x: Result) => x.vehicleUse === 'سورن پلاس')).toBe(true);
    expect([...p1.body.results, ...p2.body.results].filter((x: Result) => x.compatibility === 'other-family')).toHaveLength(87);
    // Mode A of the same query stays within the family (43 Soren parts, one page).
    const a = await search(caseId, { query: 'گلگیر آزمون' });
    expect(a.body).toMatchObject({ total: 43, hasMore: false });
  });

  it('a case whose family is unknown still searches another vehicle or all vehicles, never verified', async () => {
    const caseId = await newCase('خودروی ناشناخته آزمون');
    expect((await search(caseId, { query: 'سپر' })).body).toMatchObject({ fitmentVerified: false, results: [{partNumber:'0031400101',fitment:'common'}] });
    const all = await search(caseId, { query: 'سپر', scope: 'all' });
    expect(all.body.results.length).toBe(5);
    expect(all.body.results.filter((x: Result) => x.compatibility === 'verified').map((x: Result) => x.partNumber)).toEqual(['0031400101']);
  });

  it('validates the scope on the server and keeps tenant and role isolation', async () => {
    const caseId = await newCase('سورن ELX');
    expect((await search(caseId, { query: 'سپر', scope: 'vehicle' })).status).toBe(400);
    const unknown = await search(caseId, { query: 'سپر', scope: 'vehicle', family: 'خودرویخیالی' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe('ASSESSMENT_VEHICLE_UNKNOWN');
    expect((await search(caseId, { query: 'سپر', scope: 'everything' })).status).toBe(400);
    expect((await search(caseId, { query: 'سپر', scope: 'all', offset: -1 })).status).toBe(400);
    // A user without assessment rights, and a user of another dealership, see nothing.
    const tech = await h.loginAs('scope-tech', ['technician']);
    expect((await search(caseId, { query: 'سپر', scope: 'all' }, tech)).status).toBe(403);
    expect((await tech.get(`/cases/${caseId}/assessment-catalog/vehicles`)).status).toBe(403);
    const otherTenant = newId();
    await h.db.db.insert(tenants).values({ id: otherTenant, code: 'scope-other', name: 'نمایندگی دیگر', isTest: true });
    await h.db.db.insert(users).values({ id: newId(), tenantId: otherTenant, username: 'scope-expert', displayName: 'کارشناس دیگر', passwordHash: await hashPassword(TEST_PASSWORD), roles: ['accident_expert'], isTest: true });
    const other = await h.login('scope-expert', 'scope-other');
    expect((await search(caseId, { query: 'سپر', scope: 'all' }, other)).status).toBe(404);
    expect((await other.get(`/cases/${caseId}/assessment-catalog/vehicles`)).status).toBe(404);
  });

  it('a part of another vehicle keeps its catalog source and a pending technical check on the line', async () => {
    const caseId = await newCase('سورن ELX');
    const draft = await expert.post(`/cases/${caseId}/assessments`, { kind: 'initial', smartManual: true, assessorName: 'کارشناس ساختگی' });
    expect(draft.status).toBe(201);
    const evidence = `منبع کاتالوگ: سمند (خانوادهٔ سمند) — ${OTHER}`;
    const add = await expert.post(`/assessments/${draft.body.id}/items`, { action: 'replace', description: 'سپر جلو', sourcePartNumber: '0031200101', quantity: 2, expectedVersion: draft.body.version, evidence });
    expect(add.status).toBe(201);
    const line = add.body.items[0];
    expect(line).toMatchObject({ partNumber: '00312001', sourcePartNumber: '0031200101', quantity: 2, evidence });
    const reviews = await expert.get(`/cases/${caseId}/technical-reviews`);
    expect(reviews.status).toBe(200);
    expect(JSON.stringify(reviews.body)).toContain(line.id);
    expect(JSON.stringify(reviews.body)).toContain('pending');
    // Same 8-digit reference again is refused; quantity edit keeps the source.
    const dup = await expert.post(`/assessments/${draft.body.id}/items`, { action: 'replace', description: 'سپر جلو', sourcePartNumber: '0031200101', quantity: 1, expectedVersion: add.body.version });
    expect(dup.status).toBe(422);
    const q = await expert.patch(`/assessment-items/${line.id}`, { quantity: 3, expectedVersion: add.body.version });
    expect(q.body.items[0]).toMatchObject({ quantity: 3, evidence, sourcePartNumber: '0031200101' });
  });
});
