import assert from 'node:assert/strict';
import test from 'node:test';
import {advanceAssessmentPackage,canRemoveTechnicalLine,type AssessmentPackage} from '../assessment-package';

const draft:AssessmentPackage={id:'assessment-test',status:'draft',version:1,partCount:10,pendingTechnicalParts:10,returnedTechnicalParts:0,hasUnsafeDownstreamEdits:false};

test('submits the entire assessment once and finalizes only after all parts are reviewed',()=>{
 const submitted=advanceAssessmentPackage(draft,'submit',1);
 assert.equal(submitted.ok,true);
 assert.equal(submitted.package.status,'submitted');
 assert.equal(advanceAssessmentPackage(submitted.package,'submit',2).code,'INVALID_TRANSITION');
 const reviewing=advanceAssessmentPackage(submitted.package,'begin_review',2);
 assert.equal(reviewing.package.status,'under_review');
 assert.equal(advanceAssessmentPackage(reviewing.package,'finalize',3).code,'TECHNICAL_REVIEW_OPEN');
 const corrected={...reviewing.package,pendingTechnicalParts:0,returnedTechnicalParts:0};
 const finalized=advanceAssessmentPackage(corrected,'finalize',3);
 assert.equal(finalized.ok,true);
 assert.equal(finalized.package.status,'finalized');
 assert.equal(advanceAssessmentPackage(finalized.package,'finalize',4).code,'INVALID_TRANSITION');
});

test('rejects stale revisions, empty part packages and downstream-unsafe finalization',()=>{
 assert.equal(advanceAssessmentPackage(draft,'submit',2).code,'STALE_VERSION');
 assert.equal(advanceAssessmentPackage({...draft,partCount:0},'submit',1).code,'PARTS_REQUIRED');
 assert.equal(advanceAssessmentPackage({...draft,status:'under_review',pendingTechnicalParts:0,hasUnsafeDownstreamEdits:true},'finalize',1).code,'DOWNSTREAM_REVIEW_REQUIRED');
});

test('blocks removal of any part with reservation, purchase or delivery commitments',()=>{
 assert.equal(canRemoveTechnicalLine({reservedQuantity:0,orderedQuantity:0,deliveredQuantity:0}),true);
 assert.equal(canRemoveTechnicalLine({reservedQuantity:1,orderedQuantity:0,deliveredQuantity:0}),false);
 assert.equal(canRemoveTechnicalLine({reservedQuantity:0,orderedQuantity:1,deliveredQuantity:0}),false);
 assert.equal(canRemoveTechnicalLine({reservedQuantity:0,orderedQuantity:0,deliveredQuantity:1}),false);
 assert.equal(canRemoveTechnicalLine({reservedQuantity:-1,orderedQuantity:0,deliveredQuantity:0}),false);
});
