import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receptionDayStats } from '../reception-stats';
import { classifyCard, classifyJob, defectGroupCode, isPeriodicServiceName, isQuickServiceName } from '../service-classify';

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

// H4 part 1 (owner, 2026-11-28): codes decide; names only add. The lines below copy the shape of the
// owner's test cards (labour codes, defect groups, states and part codes only — no customer data).

const QUICK = '910100 - سرویس سریع (کوئیک سرویس)';
const job = (c: ReturnType<typeof classifyCard>) => ({ oilChange: c.oilChange, repair: c.repair, quickService: c.quickService, declined: c.declined });

test('H4: کارت سرویس سریع بی‌نام (اجرت 10165C0، 10145C0، 12115C0 زیر گروه 910100) فقط تعویض روغن است', () => {
  const c = classifyCard([{ code: '10145C0', group: QUICK, state: 'نهایی' }, { code: '10165C0', group: QUICK }, { code: '12115C0', group: QUICK }], [{ code: '07707073' }, { code: '12402043' }], null);
  assert.deepEqual(job(c), { oilChange: true, repair: false, quickService: true, declined: 0 });
});

test('H4: سرویس و لنت ترمز و کانکتور: هم تعویض روغن و هم تعمیر فنی', () => {
  const c = classifyCard([{ code: '10145C0', group: QUICK }, { code: '10165C0', group: QUICK }, { code: '41100C0', group: '410100 - ترمز ضعیف است' }, { code: '55300H0', group: '550230 - چراغ هشدار' }], [{ code: '07707076' }], null);
  assert.deepEqual(job(c), { oilChange: true, repair: true, quickService: true, declined: 0 });
});

test('H4: کد سرویس بدون گروه سرویس سریع هم تعویض روغن است؛ قطعه‌ی روغن با پسوند تأمین هم', () => {
  assert.equal(classifyCard([{ code: '91117S1' }], [], null).oilChange, true);
  assert.equal(classifyCard([], [{ code: '077070160KB' }], null).oilChange, true);
  // ضدیخ و فیلتر هوا روغن نیستند.
  assert.deepEqual(job(classifyCard([], [{ code: '07708009' }, { code: '12403046' }], null)), { oilChange: false, repair: false, quickService: false, declined: 0 });
});

test('H4: اجرت بی‌نام با کد، کار است و «بدون کار» نیست', () => {
  assert.deepEqual(job(classifyCard([{ code: '05105C1', name: null, state: 'پیش نویس' }], [], null)), { oilChange: false, repair: true, quickService: false, declined: 0 });
  assert.deepEqual(job(classifyCard([], [], null)), { oilChange: false, repair: false, quickService: false, declined: 0 });
});

test('H4: اجرت «عدم تمایل به انجام تعمیر» جدا شمرده می‌شود و کار حساب نمی‌شود', () => {
  const only = classifyCard([{ code: '11115A0', state: 'عدم تمایل به انجام تعمیر' }], [], null);
  assert.deepEqual(job(only), { oilChange: false, repair: false, quickService: false, declined: 1 });
  const mixed = classifyCard([{ code: '11115A0', state: 'عدم تمایل به انجام تعمیر' }, { code: '13160C0', state: 'نهایی' }], [], null);
  assert.deepEqual(job(mixed), { oilChange: false, repair: true, quickService: false, declined: 1 });
});

test('H4: گروه ایراد از متن «910100 - …» یا کد خالی خوانده می‌شود', () => {
  assert.equal(defectGroupCode(QUICK), '910100');
  assert.equal(defectGroupCode('۹۱۰۱۰۰'), '910100');
  assert.equal(defectGroupCode('سرویس سریع'), null);
});

test('H4: آمار روز با کدها؛ خودرو با سرویس و تعویض روغن یک بار، با روغن و تعمیر در هر دو دسته یک بار', () => {
  const stats = receptionDayStats('2026-11-28', [
    { receptionist: 'الف', codes: ['10165C0', '91117S1'], labour: [{ code: '10165C0', group: QUICK }, { code: '91117S1', group: QUICK }], parts: [{ code: '07707016' }], vehicleKey: 'car-1' },
    { receptionist: 'الف', codes: ['10165C0', '20100C0'], labour: [{ code: '10165C0', group: QUICK }, { code: '20100C0', group: '200140 - دنده' }], parts: [], vehicleKey: 'car-2' },
    { receptionist: 'ب', codes: ['11115A0'], labour: [{ code: '11115A0', state: 'عدم تمایل به انجام تعمیر' }], parts: [], vehicleKey: 'car-3' },
    { receptionist: 'ب', codes: [], labour: [], parts: [], vehicleKey: 'car-4' },
  ], ['10165C0', '10145C0', '91117S1', '91117S2']);
  assert.deepEqual(stats.jobs, { quickService: 2, oilChange: 2, technicalRepair: 1, both: 1, none: 2, vehicles: 4 });
  assert.equal(stats.declinedLabour, 1);
  assert.deepEqual({ repair: stats.repair, service: stats.service, unclassified: stats.unclassified }, { repair: 1, service: 1, unclassified: 2 });
});

test('H4 تصمیم ۱: اجرت «امداد ویژه» تعمیر فنی انجام‌شده نیست؛ کارت سرویس سریع با آن فقط تعویض روغن است', () => {
  const c = classifyCard([{ code: '10165C0', group: QUICK, state: 'نهایی' }, { code: '91117S1', group: QUICK }, { code: '53200C9', group: '530310 - چراغ روشنائی در روز', state: 'امداد ویژه' }], [{ code: '07707016' }], null);
  assert.deepEqual({ ...job(c), specialAid: c.specialAid }, { oilChange: true, repair: false, quickService: true, declined: 0, specialAid: 1 });
  const stats = receptionDayStats('2026-11-28', [{ receptionist: 'الف', codes: ['53200C9'], labour: [{ code: '53200C9', state: 'امداد ویژه' }], parts: [], vehicleKey: 'car-1' }], []);
  assert.deepEqual({ repair: stats.jobs.technicalRepair, none: stats.jobs.none, specialAidLabour: stats.specialAidLabour }, { repair: 0, none: 1, specialAidLabour: 1 });
});
