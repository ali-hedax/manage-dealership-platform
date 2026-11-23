import {createHarness, daysAgo, type Client, type Harness} from './harness';

let h:Harness,expert:Client;
beforeAll(async()=>{h=await createHarness();expert=await h.login('expert');});
afterAll(async()=>h?.close());

it('sorts all cases server-side by latest admission or case number before pagination',async()=>{
  const dates=[daysAgo(4),daysAgo(1),daysAgo(2)];
  const created:{id:string;caseNumber:string}[]=[];
  for(let i=0;i<dates.length;i++){
    const result=await expert.post('/cases',{
      admittedAt:dates[i],
      coverageType:'personal',
      vehicle:{model:'تارا',vin:`TESTVIN90000003${String(i+1).padStart(2,'0')}`},
      damageDescription:'آزمون ترتیب پرونده',
    });
    expect(result.status).toBe(201);
    created.push({id:result.body.id,caseNumber:result.body.caseNumber});
  }
  const ids=new Set(created.map(c=>c.id));
  async function list(sort:string){
    const response=await expert.get(`/cases?status=all&pageSize=100&sort=${sort}`);
    expect(response.status).toBe(200);
    return (response.body.items as {id:string}[]).filter(c=>ids.has(c.id)).map(c=>c.id);
  }
  expect(await list('admitted_desc')).toEqual([created[1]!.id,created[2]!.id,created[0]!.id]);
  expect(await list('admitted_asc')).toEqual([created[0]!.id,created[2]!.id,created[1]!.id]);
  const byNumber=[...created].sort((a,b)=>a.caseNumber.localeCompare(b.caseNumber));
  expect(await list('case_number_asc')).toEqual(byNumber.map(c=>c.id));
  expect(await list('case_number_desc')).toEqual(byNumber.reverse().map(c=>c.id));
  const invalid=await expert.get('/cases?sort=bogus');
  expect([400,422]).toContain(invalid.status);
});
