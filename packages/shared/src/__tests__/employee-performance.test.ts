import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateEmployeeScore, type EmployeeScoreEvidence} from '../employee-performance';

function evidence(employeeId:string):EmployeeScoreEvidence {
 return {
  employeeId, displayName: 'کارمند آزمایشی', roleGroup: 'parts',
  eligibleCompletedEvents: 12, metricVersion: 'parts-1',
  ratios: {progress: .9, timeliness: .8, accuracy: 1, accountability: .75},
 };
}

test('calculates a reproducible 0-100 score with explainable weighted dimensions',()=>{
 const result=calculateEmployeeScore(evidence('employee-a'));
 assert.equal(result.status,'scored');
 assert.equal(result.score,87);
 assert.deepEqual(result.breakdown,{progress:27,timeliness:20,accuracy:25,accountability:15});
 assert.equal(calculateEmployeeScore(evidence('employee-a')).score,result.score);
});

test('keeps employees with the same role or display name separate by stable ID',()=>{
 const first=calculateEmployeeScore(evidence('employee-a'));
 const second=calculateEmployeeScore({...evidence('employee-b'),ratios:{progress:.5,timeliness:.5,accuracy:.5,accountability:.5}});
 assert.notEqual(first.employeeId,second.employeeId);
 assert.equal(first.displayName,second.displayName);
 assert.notEqual(first.score,second.score);
});

test('does not invent scores for missing dimensions or insufficient activity',()=>{
 assert.equal(calculateEmployeeScore({...evidence('employee-c'),eligibleCompletedEvents:0}).score,null);
 const incomplete=calculateEmployeeScore({...evidence('employee-d'),ratios:{progress:.9,timeliness:.8,accountability:.7}});
 assert.equal(incomplete.score,null);
 assert.equal(incomplete.status,'insufficient_data');
 assert.equal(incomplete.breakdown.accuracy,null);
});

test('rejects invalid metrics and invalid identity',()=>{
 assert.throws(()=>calculateEmployeeScore({...evidence('employee-e'),ratios:{...evidence('employee-e').ratios,accuracy:1.2}}),/INVALID_SCORE_RATIO/);
 assert.throws(()=>calculateEmployeeScore({...evidence('employee-e'),eligibleCompletedEvents:-1}),/INVALID_EVENT_COUNT/);
 assert.throws(()=>calculateEmployeeScore({...evidence('employee-e'),employeeId:'  '}),/EMPLOYEE_ID_REQUIRED/);
});
