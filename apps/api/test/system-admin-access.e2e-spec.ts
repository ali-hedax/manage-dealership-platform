import {eq} from 'drizzle-orm';
import {PERMISSIONS} from '@manage/shared';
import {users} from '../src/db/schema';
import {DailyTasksService} from '../src/daily-reports/daily-tasks.service';
import {Client,createHarness,type Harness} from './harness';

let h:Harness,owner:Client,admin:Client,ownerId:string;
beforeAll(async()=>{
 h=await createHarness({config:{DAILY_SCHEDULER:'false'}});
 owner=await h.login('manager');admin=await h.login('admin');
 ownerId=(await owner.get('/auth/me')).body.id;
 await h.db.db.update(users).set({isOwner:true}).where(eq(users.id,ownerId));
 const catalog=(await owner.get('/access')).body;
 expect((await owner.put('/access/templates/system_admin',{expectedVersion:catalog.version,permissions:[...PERMISSIONS]})).status).toBe(200);
});
afterAll(async()=>{await h?.close();});

it('applies owner-configured full operations to an existing non-owner support session',async()=>{
 const me=(await admin.get('/auth/me')).body;
 expect(me.isOwner).toBe(false);expect(me.roles).toEqual(['system_admin']);
 expect(me.permissions.sort()).toEqual([...PERMISSIONS].sort());
 for(const url of ['/daily-reports/status','/daily-reports/profiles/stock','/stock/options','/workshop/overview','/users/assignable']){
  expect((await admin.get(url)).status).toBe(200);
 }
 expect((await admin.post('/emdad/requests/search',{})).status).toBe(201);
});

it('still blocks owner-only access control and stock definitions even with every permission string',async()=>{
 expect((await admin.get('/access')).status).toBe(403);
 const catalog=(await owner.get('/access')).body;
 expect((await admin.put('/access/templates/system_admin',{expectedVersion:catalog.version,permissions:[]})).status).toBe(403);
 const target=catalog.staff.find((u:{id:string})=>u.id!==ownerId);
 expect((await admin.put(`/access/users/${target.id}`,{roles:target.roles,allow:[],deny:[],expectedVersion:target.version,expectedTemplateVersion:catalog.version})).status).toBe(403);
 const profile=(await admin.get('/daily-reports/profiles/stock')).body;
 expect((await admin.patch('/daily-reports/profiles/stock',{expectedVersion:profile.version,currency:'IRR'})).status).toBe(403);
 // Daily reminder settings remain operational and do not require the owner flag.
 expect((await admin.patch('/daily-reports/profiles/stock',{expectedVersion:profile.version,reminderTime:'11:00',reminderUserId:null})).status).toBe(200);
 expect((await owner.get('/auth/me')).body.isOwner).toBe(true);
});

it('sends both pending daily reminders to support at the Tehran due time without duplicates',async()=>{
 const scheduler=h.app.get(DailyTasksService);
 const before=new Date('2035-01-07T07:29:00Z'); // 10:59 Tehran
 await scheduler.tick(before);
 // Inbox projection does not expose dedupe keys; capture its count before the due tick.
 const existing=(await admin.get('/notifications')).body.items.length;
 const first=await scheduler.tick(new Date('2035-01-07T07:31:00Z'));
 expect(first.notified).toBeGreaterThanOrEqual(2);
 const inbox=(await admin.get('/notifications')).body;
 expect(inbox.items.length).toBe(existing+2);
 expect(inbox.items.filter((n:{title:string})=>n.title.startsWith('یادآوری:'))).toHaveLength(2);
 expect((await scheduler.tick(new Date('2035-01-07T07:32:00Z'))).notified).toBe(0);
});
