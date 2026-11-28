import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isConsumedPart, normalizeLaborCode, parseLaborCodes, receptionDayStats, receptionKind, UNKNOWN_RECEPTIONIST } from '../index';

test('labour codes are compared as text with ASCII digits and leading zeros kept', () => {
  assert.equal(normalizeLaborCode(' ۰۱۲ ab '), '012AB');
  assert.deepEqual(parseLaborCodes('۰۱۰۰، 0200\n0100 ; 0300'), ['0100', '0200', '0300']);
  assert.deepEqual(parseLaborCodes('  '), []);
});

test('only-service labour is «سرویس»; any other code is «تعمیراتی»; no labour is never guessed', () => {
  const service = ['0100', '0200'];
  assert.equal(receptionKind(['0100'], service), 'service');
  assert.equal(receptionKind(['0100', '۰۲۰۰'], service), 'service');
  assert.equal(receptionKind(['0100', '9999'], service), 'repair');
  assert.equal(receptionKind([], service), 'unclassified');
  assert.equal(receptionKind([null, ' '], service), 'unclassified');
  // Without a configured list every reception with labour is a repair.
  assert.equal(receptionKind(['0100'], []), 'repair');
});

test('daily statistics per receptionist, busiest first, blank names grouped', () => {
  const stats = receptionDayStats('2026-01-10', [
    { receptionist: 'پذیرشگر الف', codes: ['0100'] },
    { receptionist: ' پذیرشگر  الف ', codes: ['5000'] },
    { receptionist: 'پذیرشگر ب', codes: [] },
    { receptionist: null, codes: ['0100', '5000'] },
    { receptionist: 'پذیرشگر الف', codes: ['0200'] },
  ], ['0100', '0200']);
  assert.equal(stats.date, '2026-01-10');
  assert.deepEqual({ total: stats.total, repair: stats.repair, service: stats.service, unclassified: stats.unclassified }, { total: 5, repair: 2, service: 2, unclassified: 1 });
  assert.equal(stats.serviceCodesConfigured, true);
  assert.deepEqual(stats.byReceptionist[0], { name: 'پذیرشگر الف', total: 3, repair: 1, service: 2, unclassified: 0 });
  assert.ok(stats.byReceptionist.some((p) => p.name === UNKNOWN_RECEPTIONIST && p.repair === 1));
  assert.equal(stats.byReceptionist.reduce((n, p) => n + p.total, 0), stats.total);
  assert.equal(receptionDayStats('2026-01-10', [], []).serviceCodesConfigured, false);
});

test('«گزارش شب» by job: oil change and technical repair are counted apart, a car can be in both, per receptionist', () => {
  const stats = receptionDayStats('2026-01-10', [
    { receptionist: 'پذیرشگر الف', codes: ['1'], labourNames: ['سرويس ۱۰۰۰۰'], consumedParts: ['فیلتر روغن'] },
    { receptionist: 'پذیرشگر الف', codes: ['2', '3'], labourNames: ['کوئیک سرویس', 'تعویض لنت جلو'], consumedParts: [] },
    { receptionist: 'پذیرشگر ب', codes: ['4'], labourNames: ['تعویض روغن گیربکس'], consumedParts: ['روغن گیربکس'] },
    { receptionist: 'پذیرشگر ب', codes: [], labourNames: [], consumedParts: ['روغن موتور'] },
    { receptionist: null, codes: [], labourNames: [null, ' '], consumedParts: [] },
  ], []);
  assert.deepEqual(stats.jobs, { quickService: 1, oilChange: 3, technicalRepair: 2, both: 1, none: 1, vehicles: 5 });
  assert.deepEqual(stats.jobsByReceptionist, [
    { name: 'پذیرشگر الف', total: 2, quickService: 1, oilChange: 2, technicalRepair: 1, both: 1, none: 0, vehicles: 2 },
    { name: 'پذیرشگر ب', total: 2, quickService: 0, oilChange: 1, technicalRepair: 1, both: 0, none: 0, vehicles: 2 },
    { name: UNKNOWN_RECEPTIONIST, total: 1, quickService: 0, oilChange: 0, technicalRepair: 0, both: 0, none: 1, vehicles: 1 },
  ]);
  // Rows without names (older callers) are «بدون کار ثبت‌شده», never guessed.
  assert.deepEqual(receptionDayStats('2026-01-10', [{ receptionist: 'x', codes: ['1'] }], []).jobs, { quickService: 0, oilChange: 0, technicalRepair: 0, both: 0, none: 1, vehicles: 1 });
});

test('S09: one car is counted once in each category, even with two cards that day; gaps are counted, not guessed', () => {
  const stats = receptionDayStats('2026-01-10', [
    { receptionist: 'الف', codes: [], vehicleKey: 'TESTVIN0000000001', labourNames: ['سرویس سریع'], consumedParts: ['فیلتر روغن'], labourWithoutName: 0, linesRead: true },
    { receptionist: 'الف', codes: [], vehicleKey: 'TESTVIN0000000001', labourNames: ['سرویس ۵۰۰۰', 'تعویض لنت'], consumedParts: [], labourWithoutName: 1, linesRead: true },
    { receptionist: 'ب', codes: [], vehicleKey: 'TESTVIN0000000002', labourNames: ['صافکاری'], consumedParts: [], partsWithoutName: 2, linesRead: true },
    { receptionist: 'ب', codes: [], vehicleKey: 'TESTVIN0000000003', labourNames: [], consumedParts: [], hall: 'سرویس سریع', linesRead: false },
  ], []);
  assert.equal(stats.total, 4);
  assert.deepEqual(stats.jobs, { quickService: 2, oilChange: 1, technicalRepair: 2, both: 1, none: 0, vehicles: 3 });
  assert.deepEqual(stats.dataGaps, { linesNotRead: 1, labourWithoutName: 1, partsWithoutName: 2 });
  assert.deepEqual(stats.jobsByReceptionist.map((p) => [p.name, p.total, p.vehicles, p.oilChange]), [['الف', 2, 1, 1], ['ب', 2, 2, 0]]);
});

test('a part counts as used only when still on the card, not rejected and with a quantity above zero', () => {
  assert.equal(isConsumedPart({ qtyFinal: '1', qtyRequested: '1', state: 'تحویل شده' }), true);
  assert.equal(isConsumedPart({ qtyFinal: '', qtyRequested: '۲' }), true);
  assert.equal(isConsumedPart({ qtyFinal: '0', qtyRequested: '1' }), false);
  assert.equal(isConsumedPart({ qtyFinal: '1', state: 'ردشده' }), false);
  assert.equal(isConsumedPart({ qtyFinal: '1', state: 'رد‌شده' }), false);
  assert.equal(isConsumedPart({ qtyFinal: '1', rejectReason: 'عدم موجودی' }), false);
  assert.equal(isConsumedPart({ qtyFinal: '1', removed: true }), false);
  assert.equal(isConsumedPart({}), false);
});
