import { createHarness, type Client, type Harness } from './harness';
import { writeSheet } from '../src/parts/xlsx';

// Intelligent manual «افزودن قطعه» (owner, 2026-11-25): the same engine and catalog as the smart
// assessment, reached from an existing vehicle case. Synthetic catalog and invented codes only.
let h: Harness;
let admin: Client, expert: Client, clerk: Client, tech: Client, narrow: Client;

async function importParts(rows: string[][]) {
  const fileBase64 = Buffer.from(writeSheet('برگه', rows)).toString('base64');
  const preview = await admin.post('/reference-imports', { kind: 'parts', fileName: 'synthetic-parts.xlsx', fileBase64, sheetIndex: 0, headerRow: 1, mapping: { partNumber: 0, description: 1, vehicleUse: 2 } });
  expect(preview.status).toBe(201);
  expect((await admin.post(`/reference-imports/${preview.body.id}/apply`)).status).toBe(201);
}
async function newCase(vehicle: Record<string, string>) {
  const r = await admin.post('/cases', { admittedAt: new Date(Date.now() - 86_400_000).toISOString(), vehicle: { vin: `TESTVIN${Math.random().toString().slice(2, 12)}`, ...vehicle }, coverageType: 'insurance' });
  expect(r.status).toBe(201);
  return r.body as { id: string };
}
type Result = { partNumber: string; reference: string | null; name: string; compatibility: string; fitmentNote: string | null; availability: string };
const search = (c: Client, caseId: string, query: string, scope: 'case' | 'all' = 'case') => c.post(`/cases/${caseId}/parts-catalog/search`, { query, scope });
const codes = (r: { body: { results: Result[] } }) => r.body.results.map((x) => x.partNumber);

beforeAll(async () => {
  h = await createHarness();
  [admin, expert] = await Promise.all([h.login('admin'), h.login('expert')]);
  clerk = await h.loginAs('entry-clerk', ['parts_clerk']);
  tech = await h.loginAs('entry-tech', ['technician']);
  // part.request without catalog access: the smart search must stay closed to it.
  narrow = await h.loginAs('entry-narrow', [], ['case.read', 'part.request']);
  await importParts([
    ['کد فنی', 'نام قطعه', 'مصرف خودرو'],
    ['2310010101', 'سپر جلو', 'دنا'],
    ['2310010201', 'سپر عقب', 'دنا'],
    ['2310020101', 'چراغ جلو راست', 'دنا'],
    ['2310020201', 'چراغ جلو چپ', 'دنا'],
    ['2310030101', 'آینه بغل راست', 'دنا'],
    ['5510010101', 'سپر جلو', 'تارا'],
    ['8810010101', 'بست سپر عمومی', 'خودروهای رایج-صرفنظراز پلتفرم'],
  ]);
});
afterAll(async () => { await h?.close(); });

describe('intelligent search from the manual «افزودن قطعه»', () => {
  it('finds parts of the case vehicle by full or partial Persian name, without re-entering the vehicle', async () => {
    const c = await newCase({ model: 'دنا' });
    const full = await search(expert, c.id, 'سپر جلو');
    expect(full.status).toBe(201);
    expect(full.body.fitmentVerified).toBe(true);
    expect(full.body.caseVehicle).toBe('دنا');
    // Compatible parts first; another vehicle's «سپر جلو» is not offered for this case.
    expect(codes(full)).toContain('2310010101');
    expect(codes(full)).not.toContain('5510010101');
    expect(full.body.results[0].partNumber).toBe('2310010101');
    expect(full.body.results[0]).toMatchObject({ compatibility: 'verified', reference: '23100101' });
    const partial = await search(expert, c.id, 'چراغ');
    expect(codes(partial).sort()).toEqual(['2310020101', '2310020201']);
    // Several words in any order.
    expect(codes(await search(expert, c.id, 'جلو چراغ چپ'))).toEqual(['2310020201']);
  });

  it('matches exact technical and procurement codes first, with Persian digits and Arabic letters', async () => {
    const c = await newCase({ model: 'دنا' });
    const procurement = await search(expert, c.id, '۲۳۱۰۰۲۰۱۰۱');
    expect(procurement.body.results[0].partNumber).toBe('2310020101');
    const eight = await search(expert, c.id, '23100201');
    expect(eight.body.results[0].partNumber).toBe('2310020101');
    // «آينه» with Arabic ي and without the madda finds «آینه».
    expect(codes(await search(expert, c.id, 'اينه'))).toEqual(['2310030101']);
  });

  it('marks parts of another vehicle as unverified when searching all vehicles, and finds nothing for an unknown part', async () => {
    const c = await newCase({ model: 'دنا' });
    const all = await search(expert, c.id, 'سپر جلو', 'all');
    const tara = all.body.results.find((x: Result) => x.partNumber === '5510010101');
    expect(tara).toBeDefined();
    expect(tara.compatibility).not.toBe('verified');
    expect(tara.fitmentNote).toBeTruthy();
    // Verified parts still rank before the other vehicle's.
    expect(all.body.results.findIndex((x: Result) => x.partNumber === '2310010101')).toBeLessThan(all.body.results.indexOf(tara));
    const unknown = await search(expert, c.id, 'قطعه‌ای که وجود ندارد');
    expect(unknown.status).toBe(201);
    expect(unknown.body.results).toEqual([]);
    // No stock report yet: availability is unknown, never shown as zero.
    expect(all.body.results.every((x: Result) => x.availability === 'unknown')).toBe(true);
  });

  it('is closed to roles that may not register part needs or read the catalog', async () => {
    const c = await newCase({ model: 'دنا' });
    expect((await search(clerk, c.id, 'سپر')).status).toBe(403);
    expect((await search(tech, c.id, 'سپر')).status).toBe(403);
    expect((await search(narrow, c.id, 'سپر')).status).toBe(403);
    // The assessment search keeps its own rule.
    expect((await clerk.post(`/cases/${c.id}/assessment-catalog/search`, { query: 'سپر' })).status).toBe(403);
  });

  it('adds several parts in a row; the same part raises the quantity of its undecided line instead of a duplicate', async () => {
    const c = await newCase({ model: 'دنا' });
    const add = (description: string, partNumber: string, quantity = 1) =>
      expert.post(`/cases/${c.id}/parts`, { description, partNumber, quantity, source: 'company', notes: 'انتخاب از جست‌وجوی هوشمند قطعات' });
    for (const q of ['سپر جلو', 'چراغ جلو راست', 'آینه']) {
      const pick = (await search(expert, c.id, q)).body.results[0] as Result;
      expect((await add(pick.name, pick.reference ?? pick.partNumber)).status).toBe(201);
    }
    const again = await add('سپر جلو', '23100101', 2);
    expect(again.status).toBe(201);
    const list = (await expert.get(`/cases/${c.id}/parts`)).body as { partNumber: string; quantity: number; status: string }[];
    expect(list.map((p) => p.partNumber).sort()).toEqual(['23100101', '23100201', '23100301']);
    expect(list.find((p) => p.partNumber === '23100101')!.quantity).toBe(3);
    // Choosing from the search never reserves, buys or delivers: every line is still a need.
    expect(list.every((p) => p.status === 'needed')).toBe(true);
  });
});
