import {DEFAULT_WORK_CALENDAR,type Assessment,type CaseDetail,type Part} from '@manage/shared';
import {createHarness,type Harness,type Client} from './harness';
import {writeSheet} from '../src/parts/xlsx';
import {eq} from 'drizzle-orm';
import {assessments} from '../src/db/schema';

let h:Harness,expert:Client,parts:Client,admin:Client;
beforeAll(async()=>{h=await createHarness();expert=await h.login('expert');parts=await h.login('parts');admin=await h.login('admin');});
afterAll(async()=>{await h?.close();});
async function newCase(extra:object={}){const r=await expert.post('/cases',{customer:{fullName:'مشتری ساختگی ارسال',phone:'09000005511'},vehicle:{model:'تارا آزمون',vin:`TESTVIN${Math.random().toString().slice(2,12)}`},admittedAt:'2026-11-05T08:00:00+03:30',coverageType:'golden_card',...extra});expect(r.status).toBe(201);return r.body as CaseDetail;}
const current=async(id:string)=>(await expert.get(`/cases/${id}/assessments`)).body.at(-1) as Assessment;
const needs=async(id:string)=>(await parts.get(`/cases/${id}/parts`)).body as Part[];
const send=(a:Assessment,ids:string[])=>expert.post(`/cases/${a.caseId}/parts/from-assessment`,{assessmentId:a.id,expectedVersion:a.version,itemIds:ids});
const sheet=(qty=2)=>Buffer.from(writeSheet('آزمون',[['شرح قطعه','شماره فنی','تعداد','فی','مبلغ'],['قطعه اول','00123456',String(qty),'100',String(qty*100)],['قطعه دوم','00123457','1','200','200'],['قطعه تازه','00123458','1','300','300']])).toString('base64');

it('dispatches selected draft needs without approval, is repeat/concurrency safe, and reaches the parts queue',async()=>{
 const c=await newCase();let a=(await expert.post(`/cases/${c.id}/assessments`,{kind:'initial',assessorName:'کارشناس آزمون'})).body as Assessment;
 for(const [code,description,quantity] of [['00123456','قطعه اول',2],['00123457','قطعه دوم',1]] as const){a=(await expert.post(`/assessments/${a.id}/items`,{expectedVersion:a.version,action:'replace',description,partNumber:code,quantity,unitPriceRial:code==='00123456'?100:200})).body;}
 const stale=a;a=(await expert.post(`/assessments/${a.id}/items`,{expectedVersion:a.version,action:'repair',description:'اجرت آزمون',labourRial:50})).body;
 expect((await send(stale,[stale.items[0]!.id])).body.code).toBe('VERSION_CONFLICT');
 expect((await send(a,[a.items.find(i=>i.action==='repair')!.id])).status).toBe(422);
 expect((await parts.post(`/cases/${c.id}/parts/from-assessment`,{assessmentId:a.id,expectedVersion:a.version,itemIds:[a.items[0]!.id]})).status).toBe(403);
 const first=a.items.find(i=>i.partNumber==='00123456')!;
 const replies=await Promise.all([send(a,[first.id]),send(a,[first.id])]);expect(replies.map(r=>r.status)).toEqual([201,201]);
 expect(await needs(c.id)).toMatchObject([{partNumber:'00123456',quantity:2,status:'needed'}]);
 expect((await parts.get('/cases?flag=parts_to_order')).body.items.some((row:{id:string})=>row.id===c.id)).toBe(true);
 expect((await expert.get(`/cases/${c.id}`)).body.blockers).toHaveLength(0);
 a=(await expert.post(`/assessments/${a.id}/finalize`,{expectedVersion:a.version})).body;expect(a.authorizationStatus).toBe('not_required');
 let supplement=(await expert.post(`/cases/${c.id}/assessments`,{kind:'supplement',assessorName:'کارشناس آزمون',reason:'بازشدن خودرو'})).body as Assessment;
 const payload={fileBase64:sheet(),currency:'rial',expectedVersion:supplement.version,dryRun:true};
 const preview=await expert.post(`/assessments/${supplement.id}/import`,payload);expect(preview.body.errors).toHaveLength(0);expect(preview.body.rows.map((r:{outcome:string})=>r.outcome)).toEqual(['unchanged','unchanged','new']);
 expect((await expert.post(`/assessments/${supplement.id}/import`,{...payload,dryRun:false})).status).toBe(201);
 supplement=await current(c.id);expect(supplement.items).toHaveLength(4);expect(supplement.items.find(i=>i.partNumber===first.partNumber)?.originItemId).toBe(first.id);
 expect((await send(supplement,supplement.items.filter(i=>i.action==='replace').map(i=>i.id))).status).toBe(201);expect(await needs(c.id)).toHaveLength(3);
 const noop=await expert.post(`/assessments/${supplement.id}/import`,{...payload,expectedVersion:supplement.version,dryRun:false});expect(noop.body.applied).toBe(true);expect((await current(c.id)).version).toBe(supplement.version);
 expect((await expert.post(`/assessments/${supplement.id}/import`,{...payload,fileBase64:sheet(3),expectedVersion:supplement.version,dryRun:false})).status).toBe(201);
 supplement=await current(c.id);const increased=supplement.items.find(i=>i.partNumber===first.partNumber)!;
 expect((await send(supplement,[increased.id])).status).toBe(201);expect((await needs(c.id)).filter(p=>p.partNumber===first.partNumber).map(p=>p.quantity).sort()).toEqual([1,2]);
 await send(supplement,[increased.id]);expect(await needs(c.id)).toHaveLength(4);
 expect((await expert.post(`/assessments/${supplement.id}/import`,{...payload,fileBase64:sheet(1),expectedVersion:supplement.version,dryRun:false})).status).toBe(201);
 supplement=await current(c.id);expect((await send(supplement,[increased.id])).body.code).toBe('ASSESSMENT_ITEM_REVIEW');expect(await needs(c.id)).toHaveLength(4);
 const oldNeed=(await needs(c.id)).find(p=>p.partNumber===first.partNumber)!;expect((await parts.post(`/parts/${oldNeed.id}/actions`,{action:'order',expectedVersion:oldNeed.version,unitPriceRial:100})).body.code).toBe('ASSESSMENT_ITEM_REVIEW');
 const old=(await expert.get(`/cases/${c.id}/assessments`)).body[0] as Assessment;expect(old.items.find(i=>i.id===first.id)?.quantity).toBe(2);
});

it('computes day-only case and station plans with short Thursday/holiday and counts overlapping allocations once',async()=>{
 const calendar=structuredClone(DEFAULT_WORK_CALENDAR);calendar.holidays=[{date:'2026-11-07',title:'تعطیلی آزمون',official:false}];calendar.holidaysVerifiedThrough='2026-11-30';
 expect((await admin.post('/workshop/calendar',{expectedVersion:0,effectiveFrom:'2026-11-05',calendar,reason:'تقویم ساختگی آزمون'})).status).toBe(201);
 const c=await newCase({repairDurationDays:10});expect(c.repairPlan?.durationMinutes).toBe(4800);expect(c.forecastDeliveryAt).toBe(new Date('2026-11-18T16:30:00+03:30').toISOString());expect(c.officialDeadlineAt).toBeNull();
 const departments=(await expert.get('/departments')).body;const departmentId=departments[0].id;
 const first=await expert.post(`/cases/${c.id}/tasks`,{departmentId,durationDays:2});expect(first.status).toBe(201);expect(first.body.plannedEndAt).toBe(new Date('2026-11-09T11:00:00+03:30').toISOString());
 const next=await expert.post(`/cases/${c.id}/tasks`,{departmentId,durationDays:1,dependsOn:[first.body.id]});expect(next.status).toBe(201);expect(next.body.plannedStartAt).toBe(first.body.plannedEndAt);expect(next.body.plannedEndAt).toBe(new Date('2026-11-10T11:00:00+03:30').toISOString());
 expect((await expert.post(`/cases/${c.id}/tasks`,{departmentId,durationDays:1,dependsOn:[first.body.id],plannedStartAt:c.repairPlan!.startAt})).body.code).toBe('DEPENDENCY_TIME_CONFLICT');
 expect((await expert.post(`/cases/${c.id}/tasks`,{departmentId,durationDays:1})).status).toBe(201);
 const overview=await expert.get('/workshop/overview');expect(overview.body.caseBudgets.find((p:{caseId:string})=>p.caseId===c.id)).toMatchObject({days:10,budgetMinutes:4800,plannedMinutes:1440});
 const latest=(await expert.get(`/cases/${c.id}`)).body as CaseDetail;
 expect((await expert.patch(`/cases/${c.id}`,{expectedVersion:latest.version,repairDurationDays:11})).body.code).toBe('REASON_REQUIRED');
 const changed=await expert.patch(`/cases/${c.id}`,{expectedVersion:latest.version,damageDescription:'شرح اصلاح‌شده'});expect(changed.status).toBe(200);expect(changed.body.repairPlan).toEqual(c.repairPlan);
});

it('clears only an explicitly confirmed legacy technical wait without issuing an external approval',async()=>{
 const c=await newCase();let a=(await expert.post(`/cases/${c.id}/assessments`,{kind:'initial',assessorName:'کارشناس آزمون'})).body as Assessment;
 a=(await expert.post(`/assessments/${a.id}/items`,{expectedVersion:a.version,action:'repair',description:'اجرت آزمون',labourRial:100})).body;
 a=(await expert.post(`/assessments/${a.id}/finalize`,{expectedVersion:a.version})).body;
 const b=await expert.post(`/cases/${c.id}/blockers`,{reason:'authorization',description:'سابقه ساختگی روال قبلی'});expect(b.status).toBe(201);
 await h.db.db.update(assessments).set({authorizationStatus:'pending',blockerId:b.body.id}).where(eq(assessments.id,a.id));
 const response=await expert.post(`/assessments/${a.id}/finalize`,{expectedVersion:a.version});expect(response.status).toBe(201);expect(response.body.authorizationStatus).toBe('not_required');expect(response.body.authorization).toBeNull();
 const detail=(await expert.get(`/cases/${c.id}`)).body as CaseDetail;expect(detail.blockers.find(row=>row.id===b.body.id)?.resolvedAt).toBeTruthy();
});
