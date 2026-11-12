import { and, eq } from 'drizzle-orm';
import type { Assessment, AssessmentImportPreview, CaseDetail, Part } from '@manage/shared';
import { notifications, partRequests, users } from '../src/db/schema';
import { writeSheet } from '../src/parts/xlsx';
import { createHarness, daysAgo, type Client, type Harness } from './harness';

// Task 3: a supplement (الحاقیه) file may reject a line that was final before and
// add a replacement with the same technical code. Synthetic data only.
let h: Harness, expert: Client, parts: Client;
beforeAll(async () => {
  h = await createHarness();
  [expert, parts] = await Promise.all(['expert', 'parts'].map((u) => h.login(u)));
});
afterAll(async () => {
  await h?.close();
});

type Line = [status: string, description: string, code: string, quantity?: number, unit?: number];
const sheet = (lines: Line[]) =>
  Buffer.from(writeSheet('آزمون', [['قطعات'], ['وضعیت', 'شرح قطعه', 'شماره فنی', 'تعداد', 'فی', 'مبلغ'], ...lines.map(([s, d, c, q = 1, u = 1000]) => [s, d, c, String(q), String(u), String(q * u)])])).toString('base64');
const current = async (caseId: string) => (await expert.get(`/cases/${caseId}/assessments`)).body.at(-1) as Assessment;
const partsOf = async (caseId: string) => (await parts.get(`/cases/${caseId}/parts`)).body as Part[];
const importFile = async (a: Assessment, lines: Line[], dryRun = false) => {
  const r = await expert.post(`/assessments/${a.id}/import`, { fileBase64: sheet(lines), currency: 'rial', expectedVersion: a.version, dryRun });
  expect(r.status).toBe(201);
  return r.body as AssessmentImportPreview;
};
const finalize = async (a: Assessment) => (await expert.post(`/assessments/${a.id}/finalize`, { expectedVersion: a.version })).body as Assessment;
const supplement = async (caseId: string) => (await expert.post(`/cases/${caseId}/assessments`, { kind: 'supplement', assessorName: 'کارشناس آزمون', reason: 'بازدید مجدد' })).body as Assessment;
const send = (a: Assessment, ids: string[]) => expert.post(`/cases/${a.caseId}/parts/from-assessment`, { assessmentId: a.id, expectedVersion: a.version, itemIds: ids });

it('marks a line rejected in a supplement, adds and links its replacement, warns about existing supply and is idempotent', async () => {
  const [me] = await h.db.db.select({ id: users.id }).from(users).where(eq(users.username, 'expert'));
  const kase = (await expert.post('/cases', {
    responsibleUserId: me!.id,
    customer: { fullName: 'مشتری ساختگی الحاقیه', phone: '09000006611' },
    vehicle: { model: 'دنا آزمون', vin: `TESTVIN${Math.random().toString().slice(2, 12)}` },
    admittedAt: daysAgo(3), coverageType: 'golden_card', damageDescription: 'آزمون ردشدن قلم در الحاقیه',
  })).body as CaseDetail;

  // Initial assessment: four final lines, all sent to the parts list; the clerk registers Emdad on Z.
  let a = (await expert.post(`/cases/${kase.id}/assessments`, { kind: 'initial', assessorName: 'کارشناس آزمون' })).body as Assessment;
  await importFile(a, [['نهایی', 'گلگیر X', '00777001'], ['نهایی', 'سپر Y', '00777002'], ['نهایی', 'چراغ Z', '00777003'], ['نهایی', 'آینه W', '00777004']]);
  a = await finalize(await current(kase.id));
  expect((await send(a, a.items.map((i) => i.id))).status).toBe(201);
  let list = await partsOf(kase.id);
  const z = list.find((p) => p.partNumber === '00777003')!;
  expect((await parts.post(`/parts/${z.id}/flow`, { expectedVersion: z.version, action: 'emdad', requestNo: '777003' })).status).toBe(201);

  // Supplement 1: X rejected and re-added with the same code (another row), W rejected without replacement.
  let s1 = await supplement(kase.id);
  const fileB: Line[] = [['رد', 'گلگیر X', '00777001'], ['نهایی', 'گلگیر X', '00777001', 1, 1200], ['نهایی', 'سپر Y', '00777002'], ['نهایی', 'چراغ Z', '00777003'], ['رد', 'آینه W', '00777004']];
  const preview = await importFile(s1, fileB, true);
  expect(preview.lineCounts).toEqual({ new: 0, unchanged: 2, updated: 0, rejected: 2, replacements: 1 });
  expect(preview.rows.find((r) => r.outcome === 'replacement')!.replaces).toMatchObject({ description: 'گلگیر X', basis: 'same_file' });
  expect(preview.rejectedExisting!.map((x) => x.description).sort()).toEqual(['آینه W', 'گلگیر X']);
  await importFile(s1, fileB);
  s1 = await finalize(await current(kase.id));
  expect(s1.items.filter((i) => i.approvalStatus === 'rejected').map((i) => i.partNumber).sort()).toEqual(['00777001', '00777004']);
  expect(s1.items.filter((i) => i.partNumber === '00777001')).toHaveLength(2);

  // The rejected lines stay, marked; only «لغو» is left for them; supply actions are refused on the server.
  list = await partsOf(kase.id);
  const oldX = list.find((p) => p.partNumber === '00777001')!;
  expect(oldX).toMatchObject({ status: 'needed', assessmentRejection: { versionNo: 2 }, allowedActions: ['cancel'] });
  expect((await parts.post(`/parts/${oldX.id}/flow`, { expectedVersion: oldX.version, action: 'emdad', requestNo: '1' })).body.code).toBe('PART_ASSESSMENT_REJECTED');
  // Not a supply need on the parts desk any more (X and W), while Y and Z still count.
  const card = ((await parts.get('/parts/desk')).body as { caseId: string; counts: Record<string, number> }[]).find((c) => c.caseId === kase.id)!;
  expect(Object.values(card.counts).reduce((n, v) => n + v, 0)).toBe(2);

  // The replacement is dispatched as its own line, linked to what it replaces (not counted as already sent).
  const replacement = s1.items.find((i) => i.partNumber === '00777001' && i.approvalStatus !== 'rejected')!;
  expect((await send(s1, [replacement.id])).status).toBe(201);
  list = await partsOf(kase.id);
  const newX = list.find((p) => p.partNumber === '00777001' && p.id !== oldX.id)!;
  expect(newX).toMatchObject({ status: 'needed', assessmentRejection: null, replaces: { description: 'گلگیر X', probable: false } });

  // Supplement 2: Z (Emdad already registered) is rejected; W comes back final (probable replacement by code).
  let s2 = await supplement(kase.id);
  const fileC: Line[] = [['نهایی', 'گلگیر X', '00777001', 1, 1200], ['نهایی', 'سپر Y', '00777002'], ['رد', 'چراغ Z', '00777003'], ['نهایی', 'آینه W', '00777004']];
  const p2 = await importFile(s2, fileC, true);
  expect(p2.lineCounts).toMatchObject({ rejected: 1, replacements: 1, unchanged: 2 });
  expect(p2.rows.find((r) => r.partNumber === '00777004')).toMatchObject({ outcome: 'replacement', replaces: { basis: 'probable' } });
  await importFile(s2, fileC);
  // The same file again: nothing new, nothing rejected twice, the draft does not change.
  s2 = await current(kase.id);
  const again = await importFile(s2, fileC);
  expect(again.lineCounts).toEqual({ new: 0, unchanged: 3, updated: 0, rejected: 0, replacements: 0 });
  expect((await current(kase.id)).version).toBe(s2.version);
  s2 = await finalize(await current(kase.id));

  // Z keeps its Emdad request (never cancelled automatically); clerk and expert are told.
  const zNow = (await partsOf(kase.id)).find((p) => p.id === z.id)!;
  expect(zNow).toMatchObject({ status: 'ordered', flowState: 'emdad', assessmentRejection: { versionNo: 3 } });
  expect(zNow.allowedActions).toContain('cancel');
  for (const username of ['parts', 'expert']) {
    const [u] = await h.db.db.select({ id: users.id }).from(users).where(eq(users.username, username));
    const sent = await h.db.db.select().from(notifications).where(and(eq(notifications.userId, u!.id), eq(notifications.kind, 'part_assessment_rejected')));
    expect(sent.map((n) => n.title)).toEqual(['قطعهٔ ردشده با تأمین ثبت‌شده: چراغ Z']);
  }
  // Nothing was deleted: four original lines plus the replacement.
  expect(await h.db.db.select().from(partRequests).where(eq(partRequests.caseId, kase.id))).toHaveLength(5);
  // One long journey (three versions, five imports): more time than a single request-level test.
}, 180_000);
