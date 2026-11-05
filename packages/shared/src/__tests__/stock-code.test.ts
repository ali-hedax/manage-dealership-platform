import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDecimal, parseBasePartNumber, parseDecimal, parseStockCode } from '../stock-code';

// Synthetic codes only (owner's rule: 8-digit base + 2-digit supply option).
test('standard supply code keeps leading zeros and splits base and supply option', () => {
  const a = parseStockCode('_x001F_ 1234567801')!;
  assert.deepEqual(
    { full: a.fullStockCode, base: a.basePartNumber, suffix: a.supplySuffix, kind: a.kind, cleaned: a.cleaned, raw: a.raw },
    { full: '1234567801', base: '12345678', suffix: '01', kind: 'standard', cleaned: true, raw: '_x001F_ 1234567801' },
  );
  assert.equal(parseStockCode('1234567899')!.supplySuffix, '99');
  assert.equal(parseStockCode('۰۰۱۲۳۴۵۶۷۸')!.fullStockCode, '0012345678');
  assert.equal(parseStockCode('0012345678')!.basePartNumber, '00123456');
  assert.equal(parseStockCode('\u001f0012345678')!.cleaned, true);
});

test('letter codes and other shapes stay standalone and need mapping; nothing is invented', () => {
  const l = parseStockCode('_x001F_123456789AB')!;
  assert.deepEqual([l.fullStockCode, l.kind, l.basePartNumber, l.supplySuffix], ['123456789AB', 'needs_mapping', null, null]);
  assert.equal(parseStockCode('1234567890a')!.fullStockCode, '1234567890A');
  // An 8-digit base is not a full code; no "00" is appended.
  const base = parseStockCode('12345678')!;
  assert.deepEqual([base.fullStockCode, base.kind], ['12345678', 'needs_mapping']);
  assert.equal(parseStockCode('  '), null);
  assert.equal(parseBasePartNumber('۱۲۳۴۵۶۷۸'), '12345678');
  assert.equal(parseBasePartNumber('1234567801'), null);
});

test('decimals are exact: no float, no rounding, no truncation', () => {
  assert.equal(parseDecimal('0.888'), '0.888');
  assert.equal(parseDecimal('12.500'), '12.5');
  assert.equal(parseDecimal('۱۲٫۵'), '12.5');
  assert.equal(parseDecimal('1,234,567.125'), '1234567.125');
  assert.equal(parseDecimal('007'), '7');
  assert.equal(parseDecimal('0.10000000000000001'), '0.10000000000000001');
  assert.equal(parseDecimal('-3'), null);
  assert.equal(parseDecimal('-3', { allowNegative: true }), '-3');
  assert.equal(parseDecimal('1e3'), null);
  assert.equal(parseDecimal('abc'), null);
  assert.equal(compareDecimal('2.5', '2.50'), 0);
  assert.equal(compareDecimal('10', '9.999'), 1);
  assert.equal(compareDecimal('0.888', '0.9'), -1);
});
