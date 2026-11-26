import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPlate, parsePlate, plateSearchKey, type Plate } from '../format';

const base: Plate = { two: '12', letter: 'ب', three: '345', region: '16' };
const national: ReadonlyArray<readonly [string, Partial<Plate>]> = [
  ['۱۲ ب ۳۴۵ – ایران ۱۶', {}],
  ['12 ب 345 16', {}],
  ['12ب34516', {}],
  ['۱۲ب۳۴۵ایران۱۶', {}],
  ['  12    ب   345   -    16   ', {}],
  ['١٢ ب ٣٤٥ ايران ١٦', {}],
  ['12|ب|345|16', {}],
  ['12–ب—345−16', {}],
  ['12 ب 345 IRAN:16', {}],
  ['ایران ۱۶ - ۱۲ ب ۳۴۵', {}],
  ['\u200F۱۲\u2067 ب ۳۴۵\u2069 ایران ۱۶', {}],
  ['12B345-16', {}],
  ['12b345', { region: null }],
  ['۱۲ ب ۳۴۵  ', { region: null }],
  ['12 ي 345 16', { letter: 'ی' }],
  ['12 ی 345 16', { letter: 'ی' }],
  ['12 ك 345 16', { letter: 'ک' }],
  ['12 ک 345 16', { letter: 'ک' }],
  ['12 الف 345 16', { letter: 'الف' }],
  ['12 ا 345 16', { letter: 'الف' }],
  ['12 ژ 345 16', { letter: 'ژ' }],
  ['12 ♿️ 345 16', { letter: 'ژ' }],
  ['12 d 345 16', { letter: 'D' }],
  ['12 S 345 16', { letter: 'S' }],
  ['12 ت 345 16', { letter: 'ت' }],
  ['12 ع 345 16', { letter: 'ع' }],
  ['۰۱ ج ۰۰۲ ایران ۰۳', { two: '01', letter: 'ج', three: '002', region: '03' }],
];

for (const [input, expected] of national) {
  test(`national plate: ${JSON.stringify(input)}`, () => {
    assert.deepEqual(parsePlate(input), { ...base, ...expected });
  });
}

for (const raw of ['  منطقه آزاد ارس ۱۲۳۴۵  ', '۱۲۳۴۵ - کیش', 'موتورسیکلت ۱۲۳-۴۵۶۷۸', '۱۲۳ ۴۵۶۷۸', '12345678']) {
  test(`other plate preserves its original text: ${JSON.stringify(raw)}`, () => {
    const plate = parsePlate(raw);
    assert.deepEqual(plate, { type: 'other', raw });
    if ('raw' in plate) assert.equal(formatPlate(plate, 'compact'), raw);
    assert.equal(plateSearchKey(raw), null);
  });
}

test('invalid plate returns a null value and a reason', () => {
  assert.deepEqual(parsePlate(null), { plate: null, reason: 'not_text' });
  assert.deepEqual(parsePlate('   '), { plate: null, reason: 'empty' });
  assert.deepEqual(parsePlate('12 ب 345 ایران 1'), { plate: null, reason: 'invalid_format' });
  assert.deepEqual(parsePlate('12 ب 345 ایران'), { plate: null, reason: 'invalid_format' });
  assert.deepEqual(parsePlate('12 XYZ 345 16'), { plate: null, reason: 'unsupported_letter' });
  assert.equal(plateSearchKey('unknown'), null);
});

test('display and compact preserve region, while full and partial queries share a search key', () => {
  assert.equal(formatPlate(base, 'display'), '۱۲ ب ۳۴۵ – ایران ۱۶');
  assert.equal(formatPlate(base, 'compact'), '۱۲ ب ۳۴۵–۱۶');
  assert.equal(formatPlate({ ...base, region: null }, 'display'), '۱۲ ب ۳۴۵');
  assert.equal(formatPlate(base, 'search'), '12b345');
  assert.equal(plateSearchKey('12b345'), plateSearchKey('۱۲ب۳۴۵۱۶'));
  assert.equal(plateSearchKey('۱۲ي۳۴۵۱۶'), plateSearchKey('12ی345'));
});
