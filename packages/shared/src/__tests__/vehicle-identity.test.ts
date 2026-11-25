import test from 'node:test';
import assert from 'node:assert/strict';
import { isVehicleIdentity, vehicleIdentityKey } from '../vehicle-identity';
import { isUniversalAssessmentSupply } from '../assessment-supplies';

test('vehicle identity normalization preserves exact identity without guessing VIN suffixes',()=>{
  assert.equal(vehicleIdentityKey(' testvin-۰۰۰۰۱۰۰۰۰۱ '),'TESTVIN0000100001');
  assert.equal(isVehicleIdentity('ab ۱۲۳۴۵۶'),true);
  assert.equal(isVehicleIdentity('TESTVIN0000100001'),true);
  assert.equal(isVehicleIdentity('123456'),false);
  assert.equal(isVehicleIdentity(''),false);
});
test('universal supplies do not admit known vehicle-specific gaskets or models',()=>{
  assert.equal(isUniversalAssessmentSupply('چسب شیشه',''),true);
  assert.equal(isUniversalAssessmentSupply('پیچ عمومی','عمومی'),true);
  assert.equal(isUniversalAssessmentSupply('واشر سرسیلندر',''),false);
  assert.equal(isUniversalAssessmentSupply('چسب شیشه','دنا'),false);
});
