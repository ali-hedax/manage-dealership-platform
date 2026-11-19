import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessmentReference, normalizedPartCode, resolveVehicleFamily } from '../vehicle-fitment';

const LABELS = ['دنا', 'دنا پلاس', 'پژو پارس', 'پژو 206', 'پژو207', 'پژو 2008', 'تارا', 'تارا با گیربکس اتوماتیک', 'ریرا', 'هایما S7', 'هایما S7 PRO', 'RD', 'سورن پلاس', 'سمند', 'خودروهای رایج-صرفنظراز پلتفرم', 'نامشخص', ''];
const fam = (model: string, trim = '', vin: string[] = []) => resolveVehicleFamily([model, trim], vin, LABELS);

test('vehicle family: longest catalog family wins, numbers match whole, nothing is guessed', () => {
  assert.deepEqual(fam('دنا پلاس موتور EF7PNA'), { status: 'verified', family: 'دناپلاس', source: 'case' });
  assert.deepEqual(fam('دنا'), { status: 'verified', family: 'دنا', source: 'case' });
  assert.equal((fam('207', '6001014 پژو 207 P7L') as { family: string }).family, 'پژو207');
  assert.equal((fam('پژو 2008') as { family: string }).family, 'پژو2008');
  assert.equal((fam('ری را', '3420201 خودروی ری را') as { family: string }).family, 'ریرا');
  assert.equal((fam('هایما S7 PRO') as { family: string }).family, 'هایماs7pro');
  assert.equal((fam('سورن', '5551501 سورن پلاس با موتور EF7') as { family: string }).family, 'سورنپلاس');
  // Digits inside a longer code are not a model number («2690530» is not «206»).
  assert.equal(fam('خودرو', '2690530 هاچ بک').status, 'unresolved');
  assert.equal(fam('').status, 'unresolved');
  assert.equal(fam('پژو 206 و سمند').status, 'unresolved');
  // The admission record of the VIN confirms, decides alone, or blocks when it disagrees.
  assert.deepEqual(fam('تارا', '', ['تارا موتور TU5P']), { status: 'verified', family: 'تارا', source: 'case+vin' });
  assert.deepEqual(fam('', '', ['پژو پارس TU5']), { status: 'verified', family: 'پژوپارس', source: 'vin' });
  assert.equal(fam('تارا', '', ['پژو پارس TU5']).status, 'conflict');
});

test('8-digit reference keeps the full code beside it and never invents one', () => {
  assert.equal(assessmentReference('0021436501'), '00214365');
  assert.equal(assessmentReference('۰۰۲۱-۴۳۶۵۰۱'), '00214365');
  assert.equal(assessmentReference('00214365789AB'), '00214365');
  assert.equal(assessmentReference('1234567'), null);
  assert.equal(assessmentReference('AB-1234'), null);
  assert.equal(normalizedPartCode('ab-1234'), 'AB1234');
});
