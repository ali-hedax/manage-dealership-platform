import test from 'node:test';
import assert from 'node:assert/strict';
import { manageSupplyAdvice } from '../manage-advisor';
test('Manage advises reserving exact sufficient stock with explainable rationale', () => {
  const recommendation = manageSupplyAdvice({partCode:'12345678',quantity:1,available:2,companyPriceRial:1000,salePriceRial:1200,coverage:'golden_card',leadDays:5,workingDaysLeft:1,blocking:true,hasDestination:true});
  assert.equal(recommendation.route,'reserve');
  assert.equal(recommendation.confidence,'high');
  assert.equal(recommendation.required.length,0);
});
test('Manage proposes market quotation rather than pretending a purchase was made',()=>{
  const recommendation = manageSupplyAdvice({partCode:'12345678',quantity:2,available:0,companyPriceRial:null,salePriceRial:null,coverage:'insurance',leadDays:5,workingDaysLeft:1,blocking:true,hasDestination:false});
  assert.equal(recommendation.route,'market');
  assert(recommendation.required.some(s=>s.includes('تأیید')));
  assert(recommendation.required.some(s=>s.includes('جایگاه')));
});
test('Manage only conditionally recommends company request for golden card with time evidence',()=>{
  const suggestion = manageSupplyAdvice({partCode:'12345678',quantity:1,available:0,companyPriceRial:1000,salePriceRial:1200,coverage:'golden_card',leadDays:2,workingDaysLeft:7,blocking:false,hasDestination:true});
  assert.equal(suggestion.route,'emdad');
  assert(suggestion.required.some(s=>s.includes('شمول')));
});
test('Manage never claims external eligibility when lead history is missing',()=>{
  const suggestion = manageSupplyAdvice({partCode:null,quantity:1,available:0,companyPriceRial:null,salePriceRial:null,coverage:'golden_card',leadDays:null,workingDaysLeft:null,blocking:false,hasDestination:false});
  assert.notEqual(suggestion.route,'emdad');
  assert.equal(suggestion.confidence,'low');
});
