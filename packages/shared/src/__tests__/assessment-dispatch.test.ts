import test from 'node:test';
import assert from 'node:assert/strict';
import {assessmentDispatchLines} from '../assessment-dispatch';
type Item=Parameters<typeof assessmentDispatchLines>[0][number];
type Request=Parameters<typeof assessmentDispatchLines>[2][number];
const item=(id:string,partNumber='00123456',quantity=2):Item=>({id,partNumber,quantity,description:'قطعه آزمون',action:'replace',approvalStatus:'pending',originItemId:null});
const request=(assessmentItemId:string|null,partNumber='00123456',quantity=2):Request=>({id:'request',assessmentItemId,partNumber,quantity,description:'قطعه آزمون',status:'needed'});
test('full technical codes stay distinct, while Persian digits of the same exact code match',()=>{
 const a=item('a'),variant=item('variant','0012345601');const rows=assessmentDispatchLines([a,variant],[a,variant],[request(null,'۰۰۱۲۳۴۵۶')]);
 assert.equal(rows[0]!.state,'sent');assert.equal(rows[1]!.quantity,2);
});
test('copied supplements share the original need and dispatch only incremental quantity',()=>{
 const a=item('a'),b={...item('b','00123456',3),originItemId:'a'},c={...item('c','00123456',4),originItemId:'b'};
 const row=assessmentDispatchLines([c],[a,b,c],[request('a')])[0]!;assert.equal(row.rootId,'a');assert.equal(row.quantity,2);
});
test('changed codes or reduced quantities require review; explicit cancelled needs can be replaced',()=>{
 const a=item('a'),b={...item('b','99999999'),originItemId:'a'};assert.equal(assessmentDispatchLines([b],[a,b],[request('a')])[0]!.state,'review');
 assert.equal(assessmentDispatchLines([a],[a],[request('a','00123456',3)])[0]!.state,'review');
 assert.equal(assessmentDispatchLines([a],[a],[{...request('a'),status:'cancelled'}])[0]!.quantity,2);
});
test('duplicate technical needs, rejected items and labour are never bulk-dispatched silently',()=>{
 const a=item('a'),b=item('b');assert.ok(assessmentDispatchLines([a,b],[a,b],[]).every(r=>r.state==='review'));
 assert.equal(assessmentDispatchLines([{...a,approvalStatus:'rejected'}],[a],[])[0]!.state,'excluded');
 assert.equal(assessmentDispatchLines([{...a,action:'repair'}],[a],[])[0]!.state,'excluded');
});
