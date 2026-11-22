import assert from 'node:assert/strict';
import test from 'node:test';
import {aggregateStaffActivity,type StaffAuditEvent} from '../employee-activity';
const t='2026-11-22T10:00:00Z';
const event=(id:string,actorUserId:string|null,action:string):StaffAuditEvent=>({id,actorUserId,action,occurredAt:t,isTest:false});

test('attributes by stable ID, not a shared job title or display name',()=>{
 const result=aggregateStaffActivity([
  event('e1','expert-1','assessment.created'),
  event('e2','expert-2','assessment.created'),
  event('e3','expert-1','assessment.finalized'),
  event('e4','parts-1','task.completed'),
 ]);
 assert.equal(result.employees.length,3);
 assert.equal(result.employees.find(x=>x.employeeId==='expert-1')!.total,2);
 assert.equal(result.employees.find(x=>x.employeeId==='expert-2')!.total,1);
 assert.equal(result.employees.find(x=>x.employeeId==='parts-1')!.total,1);
});

test('does not double count duplicate events, page views, test events or unknown actors',()=>{
 const result=aggregateStaffActivity([
  event('e1','worker-1','task.completed'),
  event('e1','worker-1','task.completed'),
  event('e2','worker-1','page.viewed'),
  {...event('e3','worker-1','task.completed'),isTest:true},
  event('e4',null,'task.completed'),
 ]);
 assert.equal(result.employees[0]!.total,1);
 assert.equal(result.unattributed,1);
 assert.equal(result.ignored,2);
});
