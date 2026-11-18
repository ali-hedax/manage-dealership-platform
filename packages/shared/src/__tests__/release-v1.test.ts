import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStockMatch, codeMatchKey, isOemStockCode, nonOemPrefix } from '../stock-code';
import { CURRENT_RELEASE, RELEASES, compareVersions, releaseProblems } from '../releases';

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

test('release metadata: semantic versions, newest first, complete Persian change lists', () => {
  assert.deepEqual(releaseProblems(), []);
  assert.equal(CURRENT_RELEASE, RELEASES[0]);
  assert.match(CURRENT_RELEASE.version, /^v\d+\.\d+\.\d+$/);
  assert.ok(compareVersions('v1.2.0', 'v1.10.0') < 0);
  assert.ok(compareVersions('v2.0.0', 'v1.99.99') > 0);
  assert.deepEqual(releaseProblems([{ ...CURRENT_RELEASE }, { ...CURRENT_RELEASE }]).length > 0, true);
  // The first numbered release lists all eight improvements of the owner's release prompt.
  const text = CURRENT_RELEASE.sections.flatMap((s) => s.items).join('\n');
  for (const needle of ['استفاده از موجودی', 'غیرشرکتی', 'لغو رزرو', 'حذف پرونده', 'نسخه جدید منیج منتشر شد', 'درخواست اصلاح شماره فنی', 'چک‌لیست برداشت قطعات', 'چک‌لیست بازدید روزانه تمام خودروهای تصادفی']) assert.ok(text.includes(needle), needle);
});
