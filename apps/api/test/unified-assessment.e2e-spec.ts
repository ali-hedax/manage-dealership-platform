import request from 'supertest';
import { eq } from 'drizzle-orm';
import { formatJalaliDateInput, formatTimeInput, type Assessment, type Part } from '@manage/shared';
import { createHarness, type Client, type Harness } from './harness';
import { buildStockXlsx, type StockRow } from '../src/daily-reports/fixtures';
import { writeSheet } from '../src/parts/xlsx';
import { stockReservations, users } from '../src/db/schema';

let h: Harness, owner: Client, expert: Client, parts: Client, caseId: string;
const codes = { both:'9910000101', zero:'9910000201', catalog:'9910000301', only:'9910000401', variant:'9910000402', other:'9910000501', glue:'9910000601', gasket:'9910000701' };
type Result = { partNumber:string; name:string; source:string; available:string|null; availability:string; reference:string };
const stockRows = (quantity='3'): StockRow[] => [
  { 'کد کالا':codes.both,'شرح کالا':'سپر یکپارچه','مدل خودرو':'تارا','موجودي':quantity,'آدرس':'D-1' },
  { 'کد کالا':codes.zero,'شرح کالا':'سپر یکپارچه','مدل خودرو':'تارا','موجودي':'0','آدرس':'D-2' },
  ...[codes.only,codes.variant].map(code => ({ 'کد کالا':code,'شرح کالا':'سپر یکپارچه','مدل خودرو':'تارا','موجودي':'2','آدرس':'D-3' })),
  { 'کد کالا':codes.other,'شرح کالا':'سپر یکپارچه','مدل خودرو':'دنا','موجودي':'20','آدرس':'D-4' },
  { 'کد کالا':codes.glue,'شرح کالا':'چسب شيشه عمومی','موجودي':'4','آدرس':'D-5' },
  { 'کد کالا':codes.gasket,'شرح کالا':'واشر سرسیلندر','موجودي':'4','آدرس':'D-6' },
];
async function publish(rows: StockRow[], minutesAgo: number) {
  const upload = await request(h.app.getHttpServer()).post('/api/v1/daily-reports/uploads?kind=stock&fileName=synthetic-unified.xlsx')
    .set('Cookie',owner.cookie).set('x-manage-client','test').set('content-type','application/octet-stream').send(Buffer.from(buildStockXlsx(rows)));
  expect(upload.status).toBe(201);
  let status='uploaded';
  for(let n=0;n<200 && ['uploaded','parsing'].includes(status);n++){
    status=(await owner.get(`/daily-reports/imports/${upload.body.id}`)).body.status;
    if(['uploaded','parsing'].includes(status))await new Promise(r=>setTimeout(r,20));
  }
  expect(status).toBe('preview');
  const at=new Date(Date.now()-minutesAgo*60_000);
  const applied=await owner.post(`/daily-reports/imports/${upload.body.id}/apply`,{
    declaration:true,declaredToday:true,acceptTemplate:true,reportDate:formatJalaliDateInput(at),reportTime:formatTimeInput(at),
  });
  expect({status:applied.status,code:applied.body.code}).toMatchObject({status:201});
  return applied.body.snapshotId as string;
}
async function search(query:string,who=expert):Promise<Result[]>{
  const res=await who.post(`/cases/${caseId}/assessment-catalog/search`,{query});
  expect(res.status).toBe(201);return res.body.results;
}
beforeAll(async()=>{
  h=await createHarness();owner=await h.loginAs('stock-owner',['system_admin']);
  await h.db.db.update(users).set({isOwner:true}).where(eq(users.username,'stock-owner'));
  expert=await h.login('expert');parts=await h.login('parts');
  const catalog=await owner.post('/reference-imports',{kind:'parts',fileName:'synthetic-unified-catalog.xlsx',
    fileBase64:Buffer.from(writeSheet('قطعات',[
      ['کد فنی','نام قطعه','مصرف خودرو'],
      ...[codes.both,codes.zero,codes.catalog].map(c=>[c,'سپر یکپارچه','تارا']),
      ['9910000801','چسب آب بندی',''],
    ])).toString('base64'),sheetIndex:0,headerRow:1,mapping:{partNumber:0,description:1,vehicleUse:2}});
  expect(catalog.status).toBe(201);expect((await owner.post(`/reference-imports/${catalog.body.id}/apply`)).status).toBe(201);
  const profile=(await owner.get('/daily-reports/profiles/stock')).body;
  expect((await owner.patch('/daily-reports/profiles/stock',{expectedVersion:profile.version,scope:'انبار ساختگی',completeness:'full',quantityMeaning:'on_hand',currency:'IRR'})).status).toBe(200);
  const c=await expert.post('/cases',{admittedAt:new Date().toISOString(),coverageType:'personal',vehicle:{model:'تارا',vin:'TESTVIN9910000001'}});
  expect(c.status).toBe(201);caseId=c.body.id;
});
afterAll(async()=>h?.close());

it('unifies sources, retains supplier variants, ranks available matches and subtracts existing reservations',async()=>{
  const snapshotId=await publish(stockRows(),3);
  const otherCase=await expert.post('/cases',{admittedAt:new Date().toISOString(),coverageType:'personal',vehicle:{model:'تارا',vin:'TESTVIN9910000002'}});
  const need=await expert.post(`/cases/${otherCase.body.id}/parts`,{description:'نیاز ساختگی رزرو',partNumber:'99100001',quantity:2,source:'stock'});
  expect(need.status).toBe(201);
  expect((await parts.post('/stock/reservations',{partRequestId:need.body.id,fullStockCode:codes.both,locationAddress:'D-1',snapshotId,quantity:'2',confirm:true})).status).toBe(201);
  const result=await search('سپر یکپا');
  expect(result.filter(r=>r.partNumber===codes.both)).toHaveLength(1);
  expect(result.find(r=>r.partNumber===codes.both)).toMatchObject({source:'both',available:'1',availability:'available'});
  expect(result.find(r=>r.partNumber===codes.only)).toMatchObject({source:'warehouse',available:'2'});
  expect(result.some(r=>r.partNumber===codes.variant)).toBe(true);
  expect(result.some(r=>r.partNumber===codes.other)).toBe(false);
  expect(result.find(r=>r.partNumber===codes.zero)).toMatchObject({source:'both',available:'0',availability:'unavailable'});
  expect(result.find(r=>r.partNumber===codes.catalog)).toMatchObject({source:'catalog',available:'0',availability:'unavailable'});
  expect(result.slice(0,3).every(r=>r.availability==='available')).toBe(true);
});

it('finds unlabelled universal supplies with Arabic/Persian text, but never treats a cylinder-head gasket as universal',async()=>{
  expect((await search('چسب شیشه')).find(r=>r.partNumber===codes.glue)).toMatchObject({source:'warehouse',available:'4'});
  expect((await search('چسب آب')).some(r=>r.partNumber==='9910000801')).toBe(true);
  expect(await search('واشر')).toEqual([]);
});

it('persists and dispatches a warehouse-only selection without reserving it during assessment',async()=>{
  const item=(await search('۹۹۱۰۰۰۰۴۰۱'))[0]!;
  expect(item.partNumber).toBe(codes.only);
  const before=await h.db.db.select().from(stockReservations);
  let a=(await expert.post(`/cases/${caseId}/assessments`,{kind:'initial',smartManual:true,assessorName:'کارشناس ساختگی'})).body as Assessment;
  const saved=await expert.post(`/assessments/${a.id}/items`,{expectedVersion:a.version,action:'replace',description:item.name,partNumber:item.reference,sourcePartNumber:item.partNumber,quantity:1});
  expect(saved.status).toBe(201);a=saved.body;
  expect(await h.db.db.select().from(stockReservations)).toEqual(before);
  expect((await expert.get(`/cases/${caseId}/assessments`)).body.at(-1).items[0]).toMatchObject({partNumber:'99100004',sourcePartNumber:codes.only});
  const review=(await parts.get(`/cases/${caseId}/technical-reviews`)).body[0];
  expect((await parts.post(`/assessment-items/${review.itemId}/technical-review`,{expectedVersion:review.version,action:'accept'})).status).toBe(201);
  const sent=await expert.post(`/cases/${caseId}/parts/from-assessment`,{assessmentId:a.id,expectedVersion:a.version,itemIds:[a.items[0]!.id]});
  expect(sent.status).toBe(201);
  expect((sent.body as Part[]).filter(p=>p.caseId===caseId&&p.partNumber==='99100004')).toHaveLength(1);
  expect(await h.db.db.select().from(stockReservations)).toEqual(before);
});

it('reflects the next applied stock file and keeps unknown availability distinct for partial reports and restricted users',async()=>{
  await publish(stockRows('6'),1);
  expect((await search(codes.both))[0]).toMatchObject({available:'4'});
  const profile=(await owner.get('/daily-reports/profiles/stock')).body;
  expect((await owner.patch('/daily-reports/profiles/stock',{expectedVersion:profile.version,completeness:'partial'})).status).toBe(200);
  expect((await search(codes.catalog))[0]).toMatchObject({available:null,availability:'unknown'});
  const narrow=await h.loginAs('catalog-only',[],['case.read','assessment.manage']);
  expect((await search(codes.both,narrow))[0]).toMatchObject({source:'catalog',available:null});
  expect(await search(codes.only,narrow)).toEqual([]);
});
