import { eq } from 'drizzle-orm';
import request from 'supertest';
import { formatJalaliDateInput, formatTimeInput, type DailyImport, type Paged, type SpecialAidDossier, type SpecialAidDossierRow } from '@manage/shared';
import { cases, users } from '../src/db/schema';
import { buildEmdadXml, emdadRow } from '../src/daily-reports/fixtures';
import { Client, createHarness, type Harness } from './harness';

// Spec section 29.7: a guest reads with the customer's full name, full chassis/VIN, phone and
// amounts hidden on the server. This sweep calls every GET route of the API as a guest and
// proves none of the synthetic customer's sensitive values reach the response, whatever the
// route. Synthetic data only (TESTVIN…, 0900…).
let h: Harness;
let parts: Client, operator: Client, guest: Client;
const VIN = 'TESTVIN0000000001'; // demo case 1: «مشتری نمونه یک», 09000000001
const FULL_NAME = 'مشتری نمونه یک';
const PHONE = '09000000001';
const EMDAD_NAME = 'مالک ساختگی کامل';
const EMDAD_PHONE = '09000000077';
// A real 1×1 PNG (synthetic image, no person or document).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
let dossierId = '';
let caseId = '';

const at = (min: number) => { const d = new Date(Date.now() + min * 60_000); return { reportDate: formatJalaliDateInput(d), reportTime: formatTimeInput(d) }; };
async function publishEmdad(min: number) {
  const row = { 'شماره شاسی': VIN, 'نام مالك': EMDAD_NAME, 'تلفن همراه مالك': EMDAD_PHONE, 'شماره کارت پذيرش': '771001', 'شماره امداد ویژه': '0077001', 'کد قطعه': '00717171', 'کد اختصاصی اولیه': '00717171', 'وضعیت امداد ویژه': 'وارد موجودی شده است', 'تاريخ رسيد شدن امداد ويژه در انبار': '1405/08/29', 'تعداد اختصاصي': '1' };
  const u = await request(h.app.getHttpServer()).post('/api/v1/daily-reports/uploads?kind=emdad&fileName=synthetic.xml').set('Cookie', parts.cookie).set('x-manage-client', 'test').set('content-type', 'application/octet-stream').send(Buffer.from(buildEmdadXml([emdadRow(1, row)])));
  expect(u.status).toBe(201);
  let job: DailyImport = u.body;
  for (let i = 0; i < 300 && ['uploaded', 'parsing'].includes(job.status); i++) { await new Promise((r) => setTimeout(r, 50)); job = (await parts.get(`/daily-reports/imports/${u.body.id}`)).body; }
  expect(job.status).toBe('preview');
  expect((await parts.post(`/daily-reports/imports/${job.id}/apply`, { declaration: true, declaredToday: true, acceptTemplate: true, ...at(min) })).status).toBe(201);
}

/** Every sensitive value of the synthetic customer, as the raw response text could carry it. */
const SECRETS = [VIN, FULL_NAME, PHONE, EMDAD_NAME, EMDAD_PHONE];
function leaks(text: string): string[] {
  return SECRETS.filter((s) => text.includes(s) || text.includes(JSON.stringify(s).slice(1, -1)));
}

beforeAll(async () => {
  h = await createHarness({ withCases: true });
  parts = await h.login('parts');
  operator = await h.loginAs('gm-operator', ['special_aid_operator']);
  guest = await h.loginAs('gm-guest', ['guest']);
  await h.db.db.update(users).set({ accessExpiresAt: new Date(Date.now() + 86_400_000) }).where(eq(users.username, 'gm-guest'));
  await publishEmdad(-30);
  const found = (await operator.post('/special-aid/dossiers/search', { q: VIN })).body as Paged<SpecialAidDossierRow>;
  dossierId = found.items[0]!.id;
  caseId = (await h.db.db.select({ id: cases.id }).from(cases).limit(1))[0]!.id;
});
afterAll(async () => { await h?.close(); });

it('staff with the customer permission still see the full values', async () => {
  const d = (await operator.get(`/special-aid/dossiers/${dossierId}`)).body as SpecialAidDossier;
  expect(d.vin).toBe(VIN);
  expect(d.vehicle.customerName).toBe(FULL_NAME);
});

it('a guest sees the special-aid dossier with name, chassis and phone hidden', async () => {
  const list = (await guest.post('/special-aid/dossiers/search', {})).body as Paged<SpecialAidDossierRow>;
  const row = list.items.find((r) => r.id === dossierId)!;
  expect(row).toBeTruthy();
  expect(row.vin).not.toBe(VIN);
  expect(row.vin.endsWith(VIN.slice(-4))).toBe(true);
  expect(row.vehicle.customerName).not.toBe(FULL_NAME);
  expect(row.vehicle.customerName?.startsWith('م…')).toBe(true);
  const d = (await guest.get(`/special-aid/dossiers/${dossierId}`)).body as SpecialAidDossier;
  expect(leaks(JSON.stringify(d))).toEqual([]);
  // Searching by the full chassis does not confirm it to a guest.
  const byVin = (await guest.post('/special-aid/dossiers/search', { q: VIN })).body as Paged<SpecialAidDossierRow>;
  expect(byVin.items.some((r) => r.id === dossierId)).toBe(false);
  // The original admission-card file cannot be masked, so a guest cannot download it; staff still can.
  const up = await operator.post('/special-aid/cards', { files: [{ fileName: `card-${VIN}.png`, mime: 'image/png', dataBase64: PNG.toString('base64') }] });
  expect(up.status).toBe(201);
  const cards = (await guest.get('/special-aid/cards')).body as { id: string; fileName: string }[];
  expect(cards.length).toBeGreaterThan(0);
  expect(leaks(JSON.stringify(cards))).toEqual([]);
  expect((await operator.get(`/special-aid/cards/${cards[0]!.id}/file`)).status).toBe(200);
  expect((await guest.get(`/special-aid/cards/${cards[0]!.id}/file`)).status).toBe(403);
});

it('no GET route of the API returns the customer\'s name, chassis or phone to a guest', async () => {
  type Layer = { route?: { path: string; methods: Record<string, boolean> } };
  const express = h.app.getHttpAdapter().getInstance() as { router?: { stack: Layer[] }; _router?: { stack: Layer[] } };
  const router = (express.router ?? express._router)!;
  const routes = router.stack.map((l) => l.route).filter((r): r is { path: string; methods: Record<string, boolean> } => !!r && !!r.methods.get).map((r) => r.path);
  expect(routes.length).toBeGreaterThan(50);
  const fill = (path: string) => path
    .replace(/\/api\/v1/, '')
    .replace(/:id\b/g, path.includes('special-aid/dossiers') ? dossierId : caseId)
    .replace(/:kind\b/g, 'customers')
    .replace(/:[a-zA-Z]+/g, '00000000-0000-4000-8000-000000000000');
  const found: string[] = [];
  let checked = 0;
  for (const path of routes) {
    for (const url of new Set([fill(path), path.includes(':id') ? fill(path).replace(caseId, dossierId) : fill(path)])) {
      const res = await guest.get(url);
      const text = typeof res.text === 'string' ? res.text : '';
      const hit = leaks(text + (res.body && !res.text ? JSON.stringify(res.body) : ''));
      if (hit.length) found.push(`${url} (${res.status}): ${hit.join(', ')}`);
      // Files and exports cannot be masked: a guest never receives one.
      const type = String(res.headers['content-type'] ?? '');
      if (res.status < 300 && type && !type.includes('json')) found.push(`${url} (${res.status}): file ${type}`);
      checked += res.status < 300 ? 1 : 0;
    }
  }
  expect(found).toEqual([]);
  // The sweep really read data as a guest, not only refusals.
  expect(checked).toBeGreaterThan(5);
});

it('read-only search routes do not leak to a guest either', async () => {
  const searches: [string, object][] = [
    ['/special-aid/dossiers/search', { q: 'TESTVIN' }],
    ['/emdad/requests/search', { q: VIN }],
    ['/reference-data/customers/search', { q: VIN }],
    [`/cases/${caseId}/parts-catalog/search`, { q: 'x' }],
    ['/report-center/detect', {}],
  ];
  const found: string[] = [];
  for (const [url, body] of searches) {
    const res = await guest.post(url, body);
    const hit = leaks(res.text ?? '');
    if (hit.length) found.push(`${url} (${res.status}): ${hit.join(', ')}`);
  }
  expect(found).toEqual([]);
});
