import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeductible, deductibleShare } from '../case-workflow';
test('deductible percentages, zero, Persian digits and rounding', () => {
  for (const value of [10, '10%', '۱۰٪', '١٠']) assert.equal(parseDeductible(value), 10);
  assert.equal(parseDeductible(0), 0);
  for (const value of ['', null, 'unknown', -1, 101, '1e2']) assert.equal(parseDeductible(value), null);
  assert.equal(deductibleShare(1000000, 10), 100000);
  assert.equal(deductibleShare(1000000, 0), 0);
  assert.equal(deductibleShare(15, 10), 2);
});
