import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyJob } from '../service-classify';

test('سرویس ۱۰۰۰۰ تنها، سرویس روغن است و تعمیر نیست', () => {
  assert.deepEqual(classifyJob(['سرويس ۱۰۰۰۰'], []), {
    oilChange: true,
    repair: false,
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
    reasons: ['اجرت تعمیراتی: صافکاری در جلو'],
  });
});
