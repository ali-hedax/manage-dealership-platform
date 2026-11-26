import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRial, formatToman, parseMoney, splitReceptionBill, sumRial } from '../format';

test('formatters use Persian digits and the Persian thousands separator', () => {
  assert.equal(formatRial(1_234_560), '۱٬۲۳۴٬۵۶۰ ریال');
  assert.equal(formatToman(1_234_560), '۱۲۳٬۴۵۶ تومان');
  assert.equal(formatRial(0), '۰ ریال');
});

test('full Toman display preserves individual Rials including negatives', () => {
  assert.equal(formatToman(12_345n), '۱٬۲۳۴٫۵ تومان');
  assert.equal(formatToman(-3n), '−۰٫۳ تومان');
  assert.equal(parseMoney(formatToman(-3n)), -3n);
});

test('short display rounds to tenths with ties away from zero and can promote units', () => {
  assert.equal(formatToman(12_000_000n, { short: true }), '۱٫۲ میلیون تومان');
  assert.equal(formatToman(12_499_999n, { short: true }), '۱٫۲ میلیون تومان');
  assert.equal(formatToman(12_500_000n, { short: true }), '۱٫۳ میلیون تومان');
  assert.equal(formatToman(-12_500_000n, { short: true }), '−۱٫۳ میلیون تومان');
  assert.equal(formatRial(999_950n, { short: true }), '۱ میلیون ریال');
  assert.equal(formatToman(15n, { short: true }), '۱٫۵ تومان');
});

test('parses Persian, Arabic and Latin digits with grouping and suffixes', () => {
  assert.equal(parseMoney('  ۱٬۲۳۴٬۵۶۷ ريال  '), 1_234_567n);
  assert.equal(parseMoney('١٢,٣٤٥ تومان'), 123_450n);
  assert.equal(parseMoney('1 234 567'), 1_234_567n);
  assert.equal(parseMoney('۱۲۳تومان'), 1_230n);
  assert.equal(parseMoney('−1.2 تومان'), -12n);
});

test('rejects malformed grouping, fractional Rial and inexact or ambiguous notation', () => {
  for (const input of ['', '12,34 تومان', '1.2 ریال', '1.23 تومان', '1.5', '1e6', '۵ دلار', '۱٫۲ میلیون تومان']) {
    assert.equal(parseMoney(input), null, input);
  }
  for (const amount of [0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatRial(amount), RangeError);
    assert.throws(() => sumRial([amount]), RangeError);
  }
});

test('round-trips and sums amounts much larger than the safe integer range', () => {
  const large = 900_719_925_474_099_312_345n;
  assert.equal(parseMoney(formatRial(large)), large);
  assert.equal(parseMoney(formatToman(large)), large);
  assert.equal(sumRial([large, 15, -2n]), large + 13n);
  assert.equal(sumRial([]), 0n);
});

test('reception bill computes or verifies the exact customer share', () => {
  const input = { total: 90_071_992_547_409_931n, freeSale: 123n, outsideWork: 50 };
  const expected = { total: input.total, freeSale: 123n, outsideWork: 50n, customerShare: 90_071_992_547_409_758n };
  assert.deepEqual(splitReceptionBill(input), expected);
  assert.deepEqual(splitReceptionBill({ ...input, customerShare: expected.customerShare }), expected);
  assert.throws(() => splitReceptionBill({ ...input, customerShare: expected.customerShare - 1n }), RangeError);
});

test('reception bill rejects negative shares and parts greater than the total', () => {
  assert.throws(() => splitReceptionBill({ total: 100, freeSale: 60, outsideWork: 41 }), RangeError);
  assert.throws(() => splitReceptionBill({ total: 100, freeSale: -1, outsideWork: 40 }), RangeError);
});
