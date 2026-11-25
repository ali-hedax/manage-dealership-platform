import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maskForGuest, maskPersonName, maskVehicleId } from '../index';

test('names keep only initials; VIN and chassis keep the last four characters', () => {
  assert.equal(maskPersonName(' مشتری  ساختگی '), 'م… س…');
  assert.equal(maskVehicleId('TESTVIN0000000001'), '•••••••••••••0001');
  assert.equal(maskVehicleId('AAA12345'), '••••2345');
  assert.equal(maskVehicleId('123'), '••••');
});

test('a guest answer hides contact data, names, identifiers and amounts deep inside, and keeps counts', () => {
  const at = new Date('2026-01-10T10:00:00Z');
  const answer = {
    items: [{ vin: 'TESTVIN0000000001', vehicle: { customerName: 'مشتری ساختگی', phone: '09000000001', plate: '11 ب 111 - 11' }, parts: [{ name: 'سپر جلو', unitPriceRial: 12_000_000, qty: 2 }], at }],
    total: 7, page: 1, admission: { chassis: 'AAA12345', receptionist: 'پذیرشگر', finalCostRial: 5, amount: 9 },
  };
  const masked = maskForGuest(answer);
  assert.equal(masked.items[0]!.vin, '•••••••••••••0001');
  assert.equal(masked.items[0]!.vehicle.customerName, 'م… س…');
  assert.equal(masked.items[0]!.vehicle.phone, null);
  assert.equal(masked.items[0]!.vehicle.plate, '11 ب 111 - 11');
  assert.deepEqual(masked.items[0]!.parts[0], { name: 'سپر جلو', unitPriceRial: null, qty: 2 });
  assert.equal(masked.items[0]!.at, at);
  assert.equal(masked.total, 7);
  assert.deepEqual(masked.admission, { chassis: '••••2345', receptionist: 'پذیرشگر', finalCostRial: null, amount: null });
  assert.equal(answer.items[0]!.vehicle.customerName, 'مشتری ساختگی', 'the original is not changed');
});
