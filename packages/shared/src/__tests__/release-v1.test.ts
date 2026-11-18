import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStockMatch, codeMatchKey, isOemStockCode, nonOemPrefix } from '../stock-code';
import { CHANGE_NOTES, RELEASE_LINE, compareVersions, nextVersion, releaseProblems, versionNotes } from '../releases';
import { SERVICE_KPIS, buildFollowUps, serviceKpiMembers } from '../service-kpis';
import { shortVehicleName } from '../desk';

// Non-OEM stock matching (owner, 2026-11-18). Synthetic codes only.
const part = (base: string | null, ...exact: string[]) => ({ base, exact });

test('non-OEM codes match by their leading 8 digits and stay distinguishable from exact and OEM matches', () => {
  // Exact OEM code (and leading zeros preserved as text).
  assert.equal(classifyStockMatch('0012345601', part('00123456', '0012345601')), 'exact');
  // OEM variant: same 8-digit assessment code, other manufacturer.
  assert.equal(classifyStockMatch('0012345602', part('00123456', '0012345601')), 'oem_variant');
  // Longer than 10 characters, trailing English letters: possible non-OEM equivalent.
  assert.equal(classifyStockMatch('00123456789AB', part('00123456')), 'non_oem');
  assert.equal(classifyStockMatch('00123456XY', part('00123456')), 'non_oem');
  assert.equal(classifyStockMatch('001234567', part('00123456')), 'non_oem');
  // Case, whitespace and safe separators do not matter; the stored code is never rewritten.
  assert.equal(codeMatchKey(' 0012-3456.78 ab '), '0012345678AB');
  assert.equal(classifyStockMatch('0012345678ab', part('00123456')), 'non_oem');
  assert.equal(classifyStockMatch('0012345678AB', part(null, '0012 3456 78ab')), 'exact');
  // Persian digits are read as Latin digits.
  assert.equal(nonOemPrefix('۰۰۱۲۳۴۵۶۷۸AB'), '00123456');
  // Not compatible: other prefix, letters first, too short, other OEM base.
  assert.equal(classifyStockMatch('00123457AB', part('00123456')), null);
  assert.equal(classifyStockMatch('AB00123456', part('00123456')), null);
  assert.equal(classifyStockMatch('0012345', part('00123456')), null);
  assert.equal(classifyStockMatch('0012345701', part('00123456')), null);
  assert.equal(nonOemPrefix('AB00123456'), null);
  // An approved alias counts as a non-OEM candidate, never as OEM.
  assert.equal(classifyStockMatch('XYZ-99', { base: '00123456', exact: [], aliasBase: '00123456' }), 'non_oem');
  assert.equal(isOemStockCode('0012345601'), true);
  assert.equal(isOemStockCode('00123456789AB'), false);
});

test('change notes: unique keys, newest first, complete Persian change lists', () => {
  assert.deepEqual(releaseProblems(), []);
  assert.ok(compareVersions('v1.2.0', 'v1.10.0') < 0);
  assert.ok(compareVersions('v2.0.0', 'v1.99.99') > 0);
  assert.equal(releaseProblems([CHANGE_NOTES[0]!, CHANGE_NOTES[0]!]).length > 0, true);
  // The first numbered release lists all eight improvements of the owner's release prompt.
  const v1 = CHANGE_NOTES.find((n) => n.key === 'v1.0.0')!;
  const text = v1.sections.flatMap((s) => s.items).join('\n');
  for (const needle of ['استفاده از موجودی', 'غیرشرکتی', 'لغو رزرو', 'حذف پرونده', 'نسخه جدید منیج منتشر شد', 'درخواست اصلاح شماره فنی', 'چک‌لیست برداشت قطعات', 'چک‌لیست بازدید روزانه تمام خودروهای تصادفی']) assert.ok(text.includes(needle), needle);
});

test('automatic patch numbers: next patch of the line, only unshipped notes, first of a line is .0', () => {
  const line = RELEASE_LINE;
  assert.deepEqual(nextVersion([]).version, `v${line.major}.${line.minor}.0`);
  const v100 = { major: 1, minor: 0, patch: 0, noteKeys: ['v1.0.0'] };
  const n = nextVersion([v100]);
  assert.equal(n.version, 'v1.0.1');
  assert.deepEqual(n.noteKeys, CHANGE_NOTES.map((x) => x.key).filter((k) => k !== 'v1.0.0'));
  // Another release of the same build has no new notes but still a new number.
  const n2 = nextVersion([v100, { ...n }]);
  assert.equal(n2.version, 'v1.0.2');
  assert.deepEqual(n2.noteKeys, []);
  // Gaps from deleted rows never reuse a lower number.
  assert.equal(nextVersion([v100, { major: 1, minor: 0, patch: 7, noteKeys: [] }]).version, 'v1.0.8');
  assert.equal(nextVersion([{ major: 0, minor: 9, patch: 4, noteKeys: [] }], CHANGE_NOTES, { major: 1, minor: 0 }).version, 'v1.0.0');
  assert.ok(versionNotes(['v1.0.0']).sections.length >= 4);
});

test('service numbers: one definition, vehicles counted once, exact lists', () => {
  const now = Date.parse('2026-11-18T10:00:00Z');
  const rows = [
    { caseId: 'a', vehicleId: 'v1', officialDeadlineAt: '2026-11-17T10:00:00Z', responsibleUserId: null, openBlockers: 1 },
    { caseId: 'b', vehicleId: 'v1', officialDeadlineAt: null, responsibleUserId: 'u', openBlockers: 2 },
    { caseId: 'c', vehicleId: 'v2', officialDeadlineAt: '2026-11-19T10:00:00Z', responsibleUserId: 'u', openBlockers: 0 },
    { caseId: 'd', vehicleId: 'v3', officialDeadlineAt: new Date('2026-11-18T09:00:00Z'), responsibleUserId: null, openBlockers: 0 },
  ];
  const m = serviceKpiMembers(rows, now);
  assert.deepEqual(m, { present: ['a', 'c', 'd'], overdue_official: ['a', 'd'], unassigned: ['a', 'd'], blocked: ['a'] });
  assert.equal(SERVICE_KPIS.present.unit, 'خودرو');
  assert.equal(SERVICE_KPIS.blocked.unit, 'خودرو');
  assert.equal(shortVehicleName('ایران خودرو', 'دنا پلاس توربو اتوماتیک'), 'دنا پلاس');
  assert.equal(shortVehicleName('ایران خودرو', null), 'ایران خودرو');
  assert.equal(buildFollowUps([]).length, 0);
});
