import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMaskedViewer, maskForGuest, maskPersonName, maskVin, redactText } from '../index';

test('only a guest is a masked viewer; the owner never is', () => {
  assert.equal(isMaskedViewer(['guest']), true);
  assert.equal(isMaskedViewer(['guest', 'special_aid_operator']), true);
  assert.equal(isMaskedViewer(['special_aid_operator']), false);
  assert.equal(isMaskedViewer(['guest'], true), false);
});

test('chassis, name and phone are masked; the last four chassis characters stay', () => {
  assert.equal(maskVin('TESTVIN0000000001'), '*************0001');
  assert.equal(maskVin('TST12345'), '****2345');
  assert.equal(maskPersonName('مشتری نمونه یک'), 'مشتری ن. ی.');
  assert.equal(maskPersonName('علی'), 'ع.');
  assert.equal(redactText('تماس با 09121234567 درباره شاسی TST12345'), 'تماس با 0912***4567 درباره شاسی ****2345');
});

test('deep masking hides names, chassis, phones and amounts but keeps ids and part codes', () => {
  const id = '01a213ff-b526-7102-8724-f268e45f46d9';
  const out = maskForGuest({
    id, vin: 'TESTVIN0000000001', items: [{ emdadNo: '0091001', assessmentCode: '00313131', procurementCode: '0031313101', unitPriceRial: 1_500_000, note: 'شاسی TESTVIN0000000001' }],
    vehicle: { customerName: 'مشتری نمونه یک', phone: '09000000001', plate: '۱۱ ب ۱۱۱ - ۱۰' }, total: 3, at: new Date(0),
  });
  assert.equal(out.id, id);
  assert.equal(out.vin, '*************0001');
  assert.equal(out.total, 3);
  assert.deepEqual(out.items[0], { emdadNo: '0091001', assessmentCode: '00313131', procurementCode: '0031313101', unitPriceRial: null, note: 'شاسی *************0001' });
  assert.equal(out.vehicle.customerName, 'مشتری ن. ی.');
  assert.equal(out.vehicle.phone, '0900***0001');
  assert.equal(out.vehicle.plate, '۱۱ ب ۱۱۱ - ۱۰');
  assert.ok(out.at instanceof Date);
});
