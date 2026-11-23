import { eq } from 'drizzle-orm';
import { cases } from '../src/db/schema';
import { writeSheet } from '../src/parts/xlsx';
import { createHarness, daysAgo, type Client, type Harness } from './harness';

// «کارشناسی ← ارسال به قطعات و تأمین» from both sides: the accident expert searches and picks a
// part, sends it, and the parts clerk sees that row exactly once in the right case. Synthetic data only.
let h: Harness;
let admin: Client, expert: Client, clerk: Client;

beforeAll(async () => {
  h = await createHarness();
  [admin, expert, clerk] = await Promise.all([h.login('admin'), h.login('expert'), h.login('parts')]);
  const workbook = Buffer.from(writeSheet('قطعات', [
    ['کد فنی', 'نام قطعه', 'مصرف خودرو'],
    ['00770001', 'سپر جلو', 'سورن پلاس'],
    ['00770002', 'گلگیر جلو چپ', 'سورن پلاس'],
    ['00770003', 'سپر جلو', 'دنا'],
    ['00770004', 'چراغ جلو راست', 'سورن پلاس'],
  ])).toString('base64');
  const preview = await admin.post('/reference-imports', {
    kind: 'parts', fileName: 'synthetic-dispatch-catalog.xlsx', fileBase64: workbook, sheetIndex: 0, headerRow: 1,
    mapping: { partNumber: 0, description: 1, vehicleUse: 2 },
  });
  expect(preview.status).toBe(201);
  expect((await admin.post(`/reference-imports/${preview.body.id}/apply`)).status).toBe(201);
});
afterAll(async () => { await h?.close(); });

type Result = { name: string; partNumber: string; vehicleUse: string };
const newCase = async (coverageType: string | undefined, extra: Record<string, unknown> = {}) => {
  const r = await expert.post('/cases', { admittedAt: daysAgo(1), vehicle: { model: 'سورن پلاس' }, damageDescription: 'آزمون ساختگی ارسال قطعه', ...(coverageType ? { coverageType } : {}), ...extra });
  expect(r.status).toBe(201);
  return r.body as { id: string; version: number; caseNumber: string };
};
const search = async (caseId: string, query: string) => {
  const r = await expert.post(`/cases/${caseId}/assessment-catalog/search`, { query });
  expect(r.status).toBe(201);
  return r.body.results as Result[];
};
const accept = async (caseId: string) => {
  const reviews = (await clerk.get(`/cases/${caseId}/technical-reviews`)).body as { itemId: string; version: number; status: string }[];
  for (const r of reviews.filter((x) => x.status === 'pending')) {
    expect((await clerk.post(`/assessment-items/${r.itemId}/technical-review`, { action: 'accept', expectedVersion: r.version })).status).toBe(201);
  }
};
const clerkParts = async (caseId: string) => ((await clerk.get(`/cases/${caseId}/parts`)).body as { partNumber: string; quantity: number; status: string }[]).filter((p) => p.status !== 'cancelled');

it('search by part name, vehicle model and technical code adds exactly the chosen part; sending reaches the parts clerk once', async () => {
  const kase = await newCase('insurance');
  // Part name and vehicle model in one query, any order.
  expect((await search(kase.id, 'سپر سورن')).map((r) => r.partNumber)).toEqual(['00770001']);
  expect((await search(kase.id, 'سورن گلگیر')).map((r) => r.partNumber)).toEqual(['00770002']);
  // The vehicle model alone lists that vehicle's parts, never another vehicle's.
  const byModel = await search(kase.id, 'سورن');
  expect(byModel.map((r) => r.partNumber).sort()).toEqual(['00770001', '00770002', '00770004']);
  // Technical code (Persian digits).
  expect((await search(kase.id, '۰۰۷۷۰۰۰۴'))[0]!.partNumber).toBe('00770004');

  const draft = await expert.post(`/cases/${kase.id}/assessments`, { kind: 'initial', smartManual: true, assessorName: 'کارشناس ساختگی' });
  expect(draft.status).toBe(201);
  const chosen = (await search(kase.id, 'سپر سورن'))[0]!;
  const added = await expert.post(`/assessments/${draft.body.id}/items`, { action: 'replace', description: chosen.name, partNumber: chosen.partNumber, quantity: 1, expectedVersion: draft.body.version });
  expect(added.status).toBe(201);
  expect(added.body.items.map((i: { partNumber: string; description: string }) => [i.partNumber, i.description])).toEqual([['00770001', 'سپر جلو']]);
  await accept(kase.id);
  const a = (await expert.get(`/cases/${kase.id}/assessments`)).body.at(-1);
  const body = { assessmentId: a.id, expectedVersion: a.version, itemIds: a.items.map((i: { id: string }) => i.id) };

  // A double click (two requests at once) and a retry after a lost response create the row once.
  const [first, second] = await Promise.all([expert.post(`/cases/${kase.id}/parts/from-assessment`, body), expert.post(`/cases/${kase.id}/parts/from-assessment`, body)]);
  expect([first.status, second.status]).toEqual([201, 201]);
  const retry = await expert.post(`/cases/${kase.id}/parts/from-assessment`, body);
  expect(retry.status).toBe(201);
  expect((await clerkParts(kase.id)).map((p) => [p.partNumber, p.quantity])).toEqual([['00770001', 1]]);
  // The parts clerk finds the row on the right case of the parts desk.
  const folders = (await clerk.get('/desk/folders')).body as { caseId: string; parts: { total: number } }[];
  expect(folders.find((f) => f.caseId === kase.id)?.parts.total).toBe(1);

  // A new part after the first dispatch: only the new line is sent.
  const now = (await expert.get(`/cases/${kase.id}/assessments`)).body.at(-1);
  const extra = (await search(kase.id, 'چراغ سورن'))[0]!;
  expect((await expert.post(`/assessments/${now.id}/items`, { action: 'replace', description: extra.name, partNumber: extra.partNumber, quantity: 1, expectedVersion: now.version })).status).toBe(201);
  await accept(kase.id);
  const later = (await expert.get(`/cases/${kase.id}/assessments`)).body.at(-1);
  const sent = await expert.post(`/cases/${kase.id}/parts/from-assessment`, { assessmentId: later.id, expectedVersion: later.version, itemIds: later.items.map((i: { id: string }) => i.id) });
  expect(sent.status).toBe(201);
  expect((await clerkParts(kase.id)).map((p) => p.partNumber).sort()).toEqual(['00770001', '00770004']);
});

it('a failed dispatch creates nothing and can be retried', async () => {
  const kase = await newCase('personal');
  const draft = (await expert.post(`/cases/${kase.id}/assessments`, { kind: 'initial', smartManual: true, assessorName: 'کارشناس ساختگی' })).body;
  const item = await expert.post(`/assessments/${draft.id}/items`, { action: 'replace', description: 'سپر جلو', partNumber: '00770001', quantity: 2, expectedVersion: draft.version });
  expect(item.status).toBe(201);
  const a = (await expert.get(`/cases/${kase.id}/assessments`)).body.at(-1);
  const ids = a.items.map((i: { id: string }) => i.id);
  // Not yet technically accepted: refused, nothing created.
  const early = await expert.post(`/cases/${kase.id}/parts/from-assessment`, { assessmentId: a.id, expectedVersion: a.version, itemIds: ids });
  expect(early.status).toBe(422);
  expect(early.body.code).toBe('ASSESSMENT_TECHNICAL_REVIEW');
  // A stale version: refused, nothing created.
  await accept(kase.id);
  const stale = await expert.post(`/cases/${kase.id}/parts/from-assessment`, { assessmentId: a.id, expectedVersion: a.version + 5, itemIds: ids });
  expect(stale.status).toBe(409);
  expect(await clerkParts(kase.id)).toEqual([]);
  // The same selection succeeds on retry.
  const ok = await expert.post(`/cases/${kase.id}/parts/from-assessment`, { assessmentId: a.id, expectedVersion: a.version, itemIds: ids });
  expect(ok.status).toBe(201);
  expect((await clerkParts(kase.id)).map((p) => [p.partNumber, p.quantity])).toEqual([['00770001', 2]]);
});

it('smart assessment for every recorded coverage except Golden Card, independent of body replacement; never for an unknown coverage', async () => {
  for (const coverageType of ['insurance', 'personal', 'mixed']) {
    for (const bodyReplacement of [false, true]) {
      const kase = await newCase(coverageType, { bodyReplacement });
      const r = await expert.post(`/cases/${kase.id}/assessments`, { kind: 'initial', smartManual: true, assessorName: 'کارشناس ساختگی' });
      expect([coverageType, bodyReplacement, r.status]).toEqual([coverageType, bodyReplacement, 201]);
    }
  }
  for (const coverageType of ['golden_card', 'unknown', undefined]) {
    const kase = await newCase(coverageType);
    const r = await expert.post(`/cases/${kase.id}/assessments`, { kind: 'initial', smartManual: true, assessorName: 'کارشناس ساختگی' });
    expect([coverageType, r.status, r.body.code]).toEqual([coverageType, 422, 'SMART_ASSESSMENT_COVERAGE']);
    // The official route stays open (Golden Card and cases whose payer is not yet known).
    expect((await expert.post(`/cases/${kase.id}/assessments`, { kind: 'initial', assessorName: 'کارشناس ساختگی' })).status).toBe(201);
  }
  // A case changed to Golden Card after a smart draft: the API refuses new lines and dispatch.
  const kase = await newCase('insurance');
  const draft = (await expert.post(`/cases/${kase.id}/assessments`, { kind: 'initial', smartManual: true, assessorName: 'کارشناس ساختگی' })).body;
  expect((await expert.post(`/assessments/${draft.id}/items`, { action: 'replace', description: 'سپر جلو', partNumber: '00770001', quantity: 1, expectedVersion: draft.version })).status).toBe(201);
  await accept(kase.id);
  const detail = (await expert.get(`/cases/${kase.id}`)).body;
  expect((await expert.patch(`/cases/${kase.id}`, { coverageType: 'golden_card', expectedVersion: detail.version })).status).toBe(200);
  const a = (await expert.get(`/cases/${kase.id}/assessments`)).body.at(-1);
  const line = await expert.post(`/assessments/${a.id}/items`, { action: 'replace', description: 'گلگیر جلو چپ', partNumber: '00770002', quantity: 1, expectedVersion: a.version });
  expect([line.status, line.body.code]).toEqual([422, 'SMART_ASSESSMENT_COVERAGE']);
  const send = await expert.post(`/cases/${kase.id}/parts/from-assessment`, { assessmentId: a.id, expectedVersion: a.version, itemIds: a.items.map((i: { id: string }) => i.id) });
  expect([send.status, send.body.code]).toEqual([422, 'SMART_ASSESSMENT_COVERAGE']);
  expect(await clerkParts(kase.id)).toEqual([]);
});

it('lists the latest admission first, numbers 99 before 100 naturally, before pagination, and edits never move a case', async () => {
  const at = new Date(Date.now() - 3_600_000).toISOString();
  const older = await newCase('insurance', { admittedAt: daysAgo(3) });
  const n99 = await newCase('insurance', { admittedAt: at });
  const n100 = await newCase('insurance', { admittedAt: at });
  const newest = await newCase('insurance', { admittedAt: new Date(Date.now() - 60_000).toISOString() });
  // Same admission time; unpadded legacy numbers 99 and 100.
  await h.db.db.update(cases).set({ caseNumber: 'AC-1405-99' }).where(eq(cases.id, n99.id));
  await h.db.db.update(cases).set({ caseNumber: 'AC-1405-100' }).where(eq(cases.id, n100.id));
  const mine = new Set([older.id, n99.id, n100.id, newest.id]);
  const expected = [newest.id, n100.id, n99.id, older.id];
  const listed = async () => ((await expert.get('/cases?status=all&pageSize=100')).body.items as { id: string }[]).map((c) => c.id).filter((id) => mine.has(id));
  expect(await listed()).toEqual(expected);
  // The newest admission is on the first page of a multi-page list.
  const page1 = await expert.get('/cases?status=all&pageSize=5&page=1');
  expect(page1.body.total).toBeGreaterThan(5);
  expect(page1.body.items[0].id).toBe(newest.id);
  // The accident and parts desks keep the same order.
  const desk = ((await expert.get('/desk/folders')).body as { caseId: string }[]).map((f) => f.caseId).filter((id) => mine.has(id));
  expect(desk).toEqual(expected);
  // Editing an older case (description) does not bring it to the top.
  const d = (await expert.get(`/cases/${older.id}`)).body;
  expect((await expert.patch(`/cases/${older.id}`, { damageDescription: 'ویرایش ساختگی', expectedVersion: d.version })).status).toBe(200);
  expect(await listed()).toEqual(expected);
});
