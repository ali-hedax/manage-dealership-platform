import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessmentReference, fitmentCatalog, normalizedPartCode, partFitment, resolveVehicleFamily, type FitmentResolution } from '../vehicle-fitment';

const LABELS = ['دنا', 'دنا پلاس', 'پژو پارس', 'پژو 206', 'پژو207', 'پژو 2008', 'تارا', 'تارا با گیربکس اتوماتیک', 'ریرا', 'هایما S7', 'هایما S7 PRO', 'RD', 'سورن پلاس', 'سمند', 'خودروهای رایج-صرفنظراز پلتفرم', 'نامشخص', ''];
const fam = (model: string, trim = '', vin: string[] = []) => resolveVehicleFamily([model, trim], vin, LABELS);
const v = (r: FitmentResolution) => (r.status === 'verified' ? [r.familyName, r.label] : [r.status]);

// «مصرف خودرو» labels of the dealership catalog (2026-11-21), labels only.
const REAL = ['سوزوکی', 'هایما S7', 'پژو پارس', 'دانگ فنگ H30', 'هایما S5', 'سمند', 'پژو 206', 'دنا', 'تارا', 'رنو کپچر', 'GRE-لونا', 'رنو تندر', 'خودرو برقی FAW NAT', 'پژو 405', 'پژو 2008', 'پژو 508', 'دانگ فنگ شاین مکس (G35) بنزینی', 'هایما 8S', 'دانگ فنگ برقی', 'پژو207', 'هایما 7X', 'ریرا', 'پژو 407', 'S30 دانگ فنگ', 'آریسان', 'پیکان', 'رانا', 'هایما S7 PRO', 'پژو 301', 'سورن پلاس', 'دانگ فنگ شاین مکس (G35) هیبریدی', 'هایما S5 PRO', 'RD', 'دنا پلاس', 'هونگ چی', 'ENVOY', 'تارا با گیربکس اتوماتیک', 'چری (CHERY)', 'نامشخص', 'خودروهای رایج-صرفنظراز پلتفرم', 'دنا پلاس اتوماتیک توربو', 'پژو 205', 'رانا پلاس پاناروما'];
const real = (model: string, trim = '', vin: string[] = []) => v(resolveVehicleFamily([model, trim], vin, REAL));

test('vehicle family: trim suffixes never hide the family, the most specific label is kept', () => {
  assert.deepEqual(fam('دنا پلاس موتور EF7PNA'), { status: 'verified', family: 'دنا', familyName: 'دنا', label: 'دناپلاس', source: 'case' });
  assert.deepEqual(fam('دنا'), { status: 'verified', family: 'دنا', familyName: 'دنا', label: 'دنا', source: 'case' });
  assert.deepEqual(v(fam('207', '6001014 پژو 207 P7L')), ['پژو 207', 'پژو207']);
  assert.deepEqual(v(fam('پژو 2008')), ['پژو 2008', 'پژو2008']);
  assert.deepEqual(v(fam('ری را', '3420201 خودروی ری را')), ['ریرا', 'ریرا']);
  assert.deepEqual(v(fam('هایما S7 PRO')), ['هایما S7', 'هایماs7pro']);
  assert.deepEqual(v(fam('سورن', '5551501 سورن پلاس با موتور EF7')), ['سورن', 'سورنپلاس']);
  // Digits inside a longer code are not a model number («2690530» is not «206»).
  assert.equal(fam('خودرو', '2690530 هاچ بک').status, 'unresolved');
  assert.equal(fam('').status, 'unresolved');
  assert.equal(fam('پژو 206 و سمند').status, 'unresolved');
  // The admission record of the VIN confirms, decides alone, or blocks when it names another family.
  assert.deepEqual(fam('تارا', '', ['تارا موتور TU5P']), { status: 'verified', family: 'تارا', familyName: 'تارا', label: 'تارا', source: 'case+vin' });
  assert.deepEqual(v(fam('', '', ['پژو پارس TU5'])), ['پژو پارس', 'پژوپارس']);
  assert.equal(fam('تارا', '', ['پژو پارس TU5']).status, 'conflict');
});

test('owner examples on the real catalog labels', () => {
  assert.deepEqual(real('سورن ELX'), ['سورن', null]);
  assert.deepEqual(real('سورن ELX با موتورEF7 بنزینی'), ['سورن', null]);
  assert.deepEqual(real('سورن پلاس'), ['سورن', 'سورنپلاس']);
  assert.deepEqual(real('پژو 207 اتوماتیک پانوراما'), ['پژو 207', 'پژو207']);
  assert.deepEqual(real('207i دنده‌ای'), ['پژو 207', 'پژو207']);
  assert.deepEqual(real('پژو 207i HB موتور TU5 گیربکس دستی 5 دنده'), ['پژو 207', 'پژو207']);
  assert.deepEqual(real('پژو ۲۰۷ اتوماتیک'), ['پژو 207', 'پژو207']);
  assert.deepEqual(real('دنا پلاس توربو اتوماتیک'), ['دنا', 'دناپلاس']);
  assert.deepEqual(real('دنا پلاس اتوماتیک توربو'), ['دنا', 'دناپلاساتوماتیکتوربو']);
  assert.deepEqual(real('دنا', '7071525 دناپلاس اتوماتیک با موتور EF7 بنزینی توربوشارژ'), ['دنا', 'دناپلاس']);
  assert.deepEqual(real('سمند LX EF7'), ['سمند', 'سمند']);
  assert.deepEqual(real('سمند LXباموتور-EF7'), ['سمند', 'سمند']);
  assert.deepEqual(real('هایما S7-موتور1800توربو-گیربکس اتوماتیک 6 سرعته'), ['هایما S7', 'هایماs7']);
  assert.deepEqual(real('هایما S7PRO-موتور1500TC-گیربکس اتوماتیک DAE'), ['هایما S7', 'هایماs7pro']);
  assert.deepEqual(real('هایما S5PRO - موتور 1500TC'), ['هایما S5', 'هایماs5pro']);
  assert.deepEqual(real('پژو 405GLX انژکتوری TU5'), ['پژو 405', 'پژو405']);
  assert.deepEqual(real('تارا موتور TU5P و گیربکس اتوماتیک DAE'), ['تارا', 'تارا']);
  assert.deepEqual(real('رانا پلاس با موتور TU5P'), ['رانا', 'رانا']);
  assert.deepEqual(real('دانگ فنگ شاین مکس G35 هیبریدی'), ['دانگ فنگ شاین مکس (G35)', 'دانگفنگشاینمکسg35هیبریدی']);
  assert.deepEqual(real('شاین مکس G35'), ['دانگ فنگ شاین مکس (G35)', null]);
  assert.deepEqual(real('پارس'), ['پژو پارس', 'پژوپارس']);
  // Long manufacturer trims mention «برقی» (throttle, steering): never the «دانگ فنگ برقی» car.
  assert.deepEqual(real('سورن ELX با موتورEF7 بنزینی', '5751901 سورن پلاس (مدل سال) با موتور EF7 بنزینی دریچه گاز برقی، EMS زیمنس، مالتی پلکس اکوماکس کروز'), ['سورن', 'سورنپلاس']);
  assert.deepEqual(real('سورن پلاس بنزینی با موتور XU7P و گیربکس دستی BE', '5840407 سورن پلاس با موتورXU7P بنزینی با دریچه گاز برقی'), ['سورن', 'سورنپلاس']);
  assert.deepEqual(real('دنا پلاس', 'فرمان برقی فراوری ساخت'), ['دنا', 'دناپلاس']);
  assert.deepEqual(real('دانگ فنگ برقی'), ['دانگ فنگ برقی', 'دانگفنگبرقی']);
});

test('unrelated families and look-alike numbers or words are never matched', () => {
  assert.deepEqual(real('پژو 2007'), ['unresolved']);
  assert.deepEqual(real('پژو 1207'), ['unresolved']);
  assert.deepEqual(real('ستارا'), ['unresolved']);
  assert.deepEqual(real('هایما S75'), ['unresolved']);
  assert.deepEqual(real('هایما 8S'), ['هایما 8S', 'هایما8s']);
  // Case and VIN record naming different families still blocks; different trims only ask for a trim check.
  assert.deepEqual(real('سورن ELX', '', ['دنا پلاس موتور EF7PNA']), ['conflict']);
  assert.deepEqual(real('سورن ELX', '', ['سورن پلاس بنزینی با موتور XU7P']), ['سورن', 'سورنپلاس']);
  assert.deepEqual(real('دنا', '', ['دنا پلاس موتور EF7PNA']), ['دنا', null]);
});

test('part fitment: own label exact, other trims of the family need a trim check, other cars never', () => {
  const catalog = fitmentCatalog(REAL);
  const at = (model: string, label: string) => partFitment(label, resolveVehicleFamily([model], [], REAL, catalog), catalog);
  assert.equal(at('سورن ELX', 'سورن پلاس'), 'review');
  assert.equal(at('سورن پلاس', 'سورن پلاس'), 'exact');
  assert.equal(at('دنا پلاس توربو', 'دنا پلاس'), 'exact');
  assert.equal(at('دنا پلاس توربو', 'دنا'), 'review');
  assert.equal(at('دنا پلاس توربو', 'دنا پلاس اتوماتیک توربو'), 'review');
  assert.equal(at('دنا پلاس توربو', 'خودروهای رایج-صرفنظراز پلتفرم'), 'common');
  assert.equal(at('دنا پلاس توربو', 'سورن پلاس'), null);
  assert.equal(at('دنا پلاس توربو', 'نامشخص'), null);
  assert.equal(at('207i', 'پژو 2008'), null);
  assert.equal(at('207i', 'پژو207'), 'exact');
  assert.deepEqual(catalog.labelsOf('دنا').sort(), ['دنا', 'دنا پلاس', 'دنا پلاس اتوماتیک توربو']);
  assert.deepEqual(catalog.labelsOf('سورن'), ['سورن پلاس']);
});

test('8-digit reference keeps the full code beside it and never invents one', () => {
  assert.equal(assessmentReference('0021436501'), '00214365');
  assert.equal(assessmentReference('۰۰۲۱-۴۳۶۵۰۱'), '00214365');
  assert.equal(assessmentReference('00214365789AB'), '00214365');
  assert.equal(assessmentReference('1234567'), null);
  assert.equal(assessmentReference('AB-1234'), null);
  assert.equal(normalizedPartCode('ab-1234'), 'AB1234');
});
