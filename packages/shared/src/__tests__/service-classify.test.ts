import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyJob, isPeriodicServiceName, isQuickServiceName } from '../service-classify';

test('سرویس ۱۰۰۰۰ تنها، سرویس روغن است و تعمیر نیست', () => {
  assert.deepEqual(classifyJob(['سرويس ۱۰۰۰۰'], []), {
    oilChange: true,
    repair: false,
    quickService: false,
    reasons: ['اجرت سرویس دوره‌ای: سرويس ۱۰۰۰۰'],
  });
});

test('قطعات روغن موتور و فیلتر روغن، بدون اجرت هم سرویس روغن هستند', () => {
  const result = classifyJob([], ['روغن موتور', 'فيلتر روغن']);
  assert.equal(result.oilChange, true);
  assert.equal(result.repair, false);
  assert.equal(result.reasons.length, 2);
});

test('تعویض روغن گیربکس سرویس روغن موتور حساب نمی‌شود', () => {
  assert.deepEqual(classifyJob(['تعویض روغن گیربکس'], ['روغن گیربکس']), {
    oilChange: false,
    repair: true,
    quickService: false,
    reasons: ['اجرت تعمیراتی: تعویض روغن گیربکس'],
  });
});

test('سرویس دوره‌ای و تعمیر می‌توانند هم‌زمان برقرار باشند', () => {
  const result = classifyJob(['کوئیک\u200cسرویس', 'تعویض لنت جلو'], []);
  assert.equal(result.oilChange, true);
  assert.equal(result.repair, true);
  assert.equal(result.reasons.length, 2);
});

test('اجرت تعمیر تنها، فقط تعمیر است', () => {
  assert.deepEqual(classifyJob(['صافکاری در جلو'], []), {
    oilChange: false,
    repair: true,
    quickService: false,
    reasons: ['اجرت تعمیراتی: صافکاری در جلو'],
  });
});

test('owner rule 2026-11-28: every service is an oil change — 5000, 10000, 20000, oil and filter, quick service', () => {
  for (const name of ['سرویس ۵۰۰۰', 'سرویس 10000 کیلومتری', 'سرويس دوره اي ۲۰٬۰۰۰ کیلومتر', 'سرویس اولیه 5,000', 'تعویض روغن و فیلتر', 'سرویس سریع', 'کوییک سرویس']) {
    assert.equal(isPeriodicServiceName(name), true, name);
    assert.deepEqual([classifyJob([name], []).oilChange, classifyJob([name], []).repair], [true, false], name);
  }
  // Other kilometre marks and other oils are not this rule.
  for (const name of ['سرویس ۲۵۰۰۰', 'سرویس 150000', 'تعویض روغن ترمز', 'روغن هیدرولیک فرمان', 'تعویض لنت']) assert.equal(isPeriodicServiceName(name), false, name);
});

test('quick service from the labour name or from the quick-service hall; a car may be quick service and repair', () => {
  assert.equal(classifyJob(['سرویس سریع'], []).quickService, true);
  assert.equal(classifyJob(['سرویس ۱۰۰۰۰'], []).quickService, false);
  const hall = classifyJob(['تعویض باتری'], [], 'سالن سرویس سریع');
  assert.deepEqual([hall.quickService, hall.repair, hall.oilChange], [true, true, false]);
  assert.equal(classifyJob(['تعویض باتری'], [], 'سالن تعمیرات').quickService, false);
  assert.equal(isQuickServiceName('کوئیک‌سرویس'), true);
  assert.equal(isQuickServiceName(null), false);
});

test('engine oil or an oil filter among the used parts makes an oil change even with a repair name only', () => {
  const r = classifyJob(['تعویض تسمه تایم'], ['روغن موتور ۱۰W40', 'فیلتر روغن']);
  assert.deepEqual([r.oilChange, r.repair, r.quickService], [true, true, false]);
});
