import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { REPAIR_TRADES, REPAIR_TRADE_LABELS, DEFAULT_WORK_CALENDAR, unionElapsedMinutes, workingMinutesBetween, type CalendarRevision, type PartQuote, type WorkshopOverview, type WorkshopStation, type WorkshopTask, type saveCalendarSchema, type stationSchema, type quoteSchema, type quoteDecisionSchema } from '@manage/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { blockers, cases, departments, partQuotes, partRequests, taskDependencies, tasks, tenants, users, vehicles, workCalendars, workshopStations } from '../db/schema';
import { CasesService } from '../cases/cases.service';

export async function calendarAt(db:DbOrTx,tenantId:string,date:string):Promise<CalendarRevision> {
  const rows=await db.select().from(workCalendars).where(eq(workCalendars.tenantId,tenantId)).orderBy(desc(workCalendars.version));
  const day=new Date(Date.parse(date)+210*60_000).toISOString().slice(0,10);
  const row=rows.find(r=>r.effectiveFrom<=day);
  return row ? {id:row.id,version:row.version,effectiveFrom:row.effectiveFrom,calendar:row.calendar} : {id:null,version:0,effectiveFrom:'2000-01-01',calendar:DEFAULT_WORK_CALENDAR};
}
const iso=(d:Date|null)=>d?.toISOString()??null;
@Injectable()
export class WorkshopService {
  constructor(@Inject(DATABASE) private readonly handle:DatabaseHandle,private readonly audit:AuditService,private readonly cases:CasesService){}
  private get db(){return this.handle.db;}
  async calendars(actor:Actor) {
    const history=await this.db.select().from(workCalendars).where(eq(workCalendars.tenantId,actor.user.tenantId)).orderBy(desc(workCalendars.version));
    return {current:await calendarAt(this.db,actor.user.tenantId,new Date().toISOString()),version:history[0]?.version??0,history:history.map(r=>({id:r.id,version:r.version,effectiveFrom:r.effectiveFrom,calendar:r.calendar,reason:r.reason}))};
  }
  async saveCalendar(actor:Actor,input:z.infer<typeof saveCalendarSchema>) {
    await this.db.transaction(async tx=>{
      await tx.select({id:tenants.id}).from(tenants).where(eq(tenants.id,actor.user.tenantId)).for('update');
      const [latest]=await tx.select().from(workCalendars).where(eq(workCalendars.tenantId,actor.user.tenantId)).orderBy(desc(workCalendars.version)).limit(1);
      if((latest?.version??0)!==input.expectedVersion)throw versionConflict(latest?.version??0);
      const today=new Date(Date.now()+210*60_000).toISOString().slice(0,10);
      if(input.effectiveFrom<today)throw badRequest('CALENDAR_PAST','تغییر تقویم نمی‌تواند برای گذشته اعمال شود');
      const id=newId(),version=input.expectedVersion+1;
      const [row]=await tx.insert(workCalendars).values({id,tenantId:actor.user.tenantId,effectiveFrom:input.effectiveFrom,calendar:input.calendar,reason:input.reason,version,createdBy:actor.user.id,isTest:actor.user.isTestTenant}).returning();
      await this.audit.record(tx,actor,{entityType:'work_calendar',entityId:id,action:'work_calendar.created',reason:input.reason,after:{effectiveFrom:input.effectiveFrom,calendar:input.calendar},snapshot:{version,row}});
    });
    return this.calendars(actor);
  }
  async stations(actor:Actor):Promise<WorkshopStation[]> {
    const rows=await this.db.select().from(workshopStations).where(eq(workshopStations.tenantId,actor.user.tenantId)).orderBy(asc(workshopStations.code));
    return rows.map(r=>({...r,trade:r.trade as WorkshopStation['trade']}));
  }
  async setupTrades(actor:Actor) {
    await this.db.transaction(async tx=>{
      await tx.select({id:tenants.id}).from(tenants).where(eq(tenants.id,actor.user.tenantId)).for('update');
      const existing=await tx.select().from(departments).where(eq(departments.tenantId,actor.user.tenantId));
      for(const trade of REPAIR_TRADES) {
        if(existing.some(d=>d.code===trade))continue;
        const id=newId();const [row]=await tx.insert(departments).values({id,tenantId:actor.user.tenantId,code:trade,name:REPAIR_TRADE_LABELS[trade]}).returning();
        await this.audit.record(tx,actor,{entityType:'reference',entityId:id,action:'department.created',after:{code:trade,name:row.name},snapshot:{version:1,row}});
      }
    });return {status:'ok'};
  }
  async staff(actor:Actor) {
    return this.db.select({id:users.id,displayName:users.displayName}).from(users).where(and(eq(users.tenantId,actor.user.tenantId),eq(users.isActive,true))).orderBy(asc(users.displayName));
  }
  async saveStation(actor:Actor,input:z.infer<typeof stationSchema>,id?:string) {
    await this.db.transaction(async tx=>{
      await tx.select({id:tenants.id}).from(tenants).where(eq(tenants.id,actor.user.tenantId)).for('update');
      const [department]=await tx.select().from(departments).where(and(eq(departments.id,input.departmentId),eq(departments.tenantId,actor.user.tenantId),eq(departments.isActive,true)));
      if(!department)throw badRequest('INVALID_DEPARTMENT','واحد انتخاب‌شده معتبر نیست');
      if(input.responsibleUserId)await this.assertStaff(tx,actor.user.tenantId,input.responsibleUserId);
      const duplicates=await tx.select({id:workshopStations.id}).from(workshopStations).where(and(eq(workshopStations.tenantId,actor.user.tenantId),eq(workshopStations.code,input.code)));
      if(duplicates.some(r=>r.id!==id))throw badRequest('STATION_CODE_EXISTS','این کد جایگاه قبلاً ثبت شده است');
      const {expectedVersion,...fields}=input;
      if(id) {
        const [before]=await tx.select().from(workshopStations).where(and(eq(workshopStations.id,id),eq(workshopStations.tenantId,actor.user.tenantId))).for('update');
        if(!before)throw notFound('جایگاه');if(before.version!==expectedVersion)throw versionConflict(before.version);
        const [row]=await tx.update(workshopStations).set({...fields,version:before.version+1,updatedAt:new Date()}).where(and(eq(workshopStations.id,id),eq(workshopStations.tenantId,actor.user.tenantId))).returning();
        await this.audit.record(tx,actor,{entityType:'workshop_station',entityId:id,action:'workshop_station.updated',before,after:fields,snapshot:{version:row.version,row}});
      } else {
        const stationId=newId();const [row]=await tx.insert(workshopStations).values({...fields,id:stationId,tenantId:actor.user.tenantId,isTest:actor.user.isTestTenant}).returning();
        await this.audit.record(tx,actor,{entityType:'workshop_station',entityId:stationId,action:'workshop_station.created',after:fields,snapshot:{version:1,row}});
      }
    });return this.stations(actor);
  }
  private async assertStaff(tx:DbOrTx,tenantId:string,id:string) {
    const [u]=await tx.select({id:users.id}).from(users).where(and(eq(users.id,id),eq(users.tenantId,tenantId),eq(users.isActive,true)));
    if(!u)throw badRequest('INVALID_ASSIGNEE','همکار انتخاب‌شده معتبر یا فعال نیست');
  }
  async taskList(actor:Actor,own=false):Promise<WorkshopTask[]> {
    const tid=actor.user.tenantId;
    const rows=await this.db.select({t:tasks,c:cases,v:vehicles,d:departments}).from(tasks)
      .innerJoin(cases,and(eq(cases.id,tasks.caseId),eq(cases.tenantId,tid)))
      .innerJoin(vehicles,and(eq(vehicles.id,cases.vehicleId),eq(vehicles.tenantId,tid)))
      .innerJoin(departments,and(eq(departments.id,tasks.departmentId),eq(departments.tenantId,tid)))
      .where(and(eq(tasks.tenantId,tid),own?eq(tasks.assignedUserId,actor.user.id):undefined)).orderBy(asc(tasks.sortOrder),asc(tasks.createdAt));
    const deps=await this.db.select({id:taskDependencies.taskId,status:tasks.status}).from(taskDependencies).innerJoin(tasks,eq(tasks.id,taskDependencies.dependsOnTaskId)).where(eq(tasks.tenantId,tid));
    const now=new Date().toISOString();
    return rows.map(({t,c,v,d})=>{
      const calendar=t.calendarSnapshot?.calendar;
      const end=iso(t.actualEndAt)??now,deadline=iso(t.baselineEndAt),snapshot=t.stationSnapshot;
      return {id:t.id,caseId:c.id,caseNumber:c.caseNumber,vehicleLabel:[v.brand,v.model,v.trim].filter(Boolean).join(' '),plate:v.plate,title:t.title,stationCode:snapshot?.code??null,stationName:snapshot?.name??null,departmentName:d.name,technicianName:t.technicianName,status:t.status,version:t.version,plannedStartAt:iso(t.plannedStartAt),plannedEndAt:iso(t.plannedEndAt),baselineEndAt:deadline,actualStartAt:iso(t.actualStartAt),actualEndAt:iso(t.actualEndAt),approvedAt:iso(t.approvedAt),canStart:t.status==='pending'&&c.status==='open'&&c.stage!=='delivered'&&!deps.some(e=>e.id===t.id&&e.status!=='approved'),workMinutes:calendar&&t.actualStartAt?workingMinutesBetween(t.actualStartAt.toISOString(),end,calendar):null,lateMinutes:calendar&&deadline?workingMinutesBetween(deadline,end,calendar):null,transferMinutes:calendar&&t.actualEndAt?workingMinutesBetween(t.actualEndAt.toISOString(),iso(t.approvedAt)??now,calendar):null,calendarConfirmed:!!calendar?.holidaysVerifiedThrough&&calendar.holidaysVerifiedThrough>=new Date(Date.parse(end)+210*60000).toISOString().slice(0,10)};
    });
  }
  async quotes(actor:Actor,caseId?:string):Promise<PartQuote[]> {
    const rows=await this.db.select({q:partQuotes,p:partRequests,c:cases}).from(partQuotes)
      .innerJoin(partRequests,and(eq(partRequests.id,partQuotes.partId),eq(partRequests.tenantId,actor.user.tenantId)))
      .innerJoin(cases,and(eq(cases.id,partQuotes.caseId),eq(cases.tenantId,actor.user.tenantId)))
      .where(and(eq(partQuotes.tenantId,actor.user.tenantId),caseId?eq(partQuotes.caseId,caseId):undefined)).orderBy(desc(partQuotes.createdAt),desc(partQuotes.id));
    return rows.map(({q,p,c})=>({...q,description:p.description,partNumber:p.partNumber,caseNumber:c.caseNumber,createdAt:q.createdAt.toISOString(),decidedAt:iso(q.decidedAt),validUntil:q.validUntil.toISOString()}));
  }
  async propose(actor:Actor,partId:string,input:z.infer<typeof quoteSchema>) {
    await this.db.transaction(async tx=>{
      const [p]=await tx.select().from(partRequests).where(and(eq(partRequests.id,partId),eq(partRequests.tenantId,actor.user.tenantId))).for('update');
      if(!p)throw notFound('قطعه');if(p.version!==input.expectedVersion)throw versionConflict(p.version);
      await this.cases.loadForWrite(tx,actor.user.tenantId,p.caseId);
      if(!['needed','rejected'].includes(p.status))throw badRequest('QUOTE_NOT_ALLOWED','قیمت جدید فقط پیش از خرید ثبت می‌شود');
      if(new Date(input.validUntil)<=new Date())throw badRequest('QUOTE_EXPIRED','اعتبار پیشنهاد باید در آینده باشد');
      const superseded=await tx.update(partQuotes).set({status:'superseded',version:sql`${partQuotes.version}+1`}).where(and(eq(partQuotes.tenantId,actor.user.tenantId),eq(partQuotes.partId,partId),inArray(partQuotes.status,['pending','approved','rejected']))).returning();
      for(const row of superseded)await this.audit.record(tx,actor,{entityType:'part_quote',entityId:row.id,caseId:p.caseId,action:'part_quote.superseded',after:{status:'superseded'},snapshot:{version:row.version,row}});
      const id=newId();const [row]=await tx.insert(partQuotes).values({id,tenantId:actor.user.tenantId,partId,caseId:p.caseId,quantity:p.quantity,unitPriceRial:input.unitPriceRial,supplier:input.supplier,validUntil:new Date(input.validUntil),note:input.note,createdBy:actor.user.id,isTest:actor.user.isTestTenant}).returning();
      const [updatedPart]=await tx.update(partRequests).set({version:p.version+1,updatedAt:new Date()}).where(and(eq(partRequests.id,partId),eq(partRequests.tenantId,actor.user.tenantId))).returning();
      await this.audit.record(tx,actor,{entityType:'part',entityId:partId,caseId:p.caseId,action:'part.quote_version_changed',after:{version:updatedPart.version},snapshot:{version:updatedPart.version,row:updatedPart}});
      await this.audit.record(tx,actor,{entityType:'part_quote',entityId:id,caseId:p.caseId,action:'part_quote.proposed',after:{partId,quantity:p.quantity,...input},snapshot:{version:1,row}});
    });return this.quotes(actor);
  }
  async decide(actor:Actor,id:string,input:z.infer<typeof quoteDecisionSchema>) {
    await this.db.transaction(async tx=>{
      const [initial]=await tx.select().from(partQuotes).where(and(eq(partQuotes.id,id),eq(partQuotes.tenantId,actor.user.tenantId)));
      if(!initial)throw notFound('پیشنهاد قیمت');
      const [part]=await tx.select().from(partRequests).where(and(eq(partRequests.id,initial.partId),eq(partRequests.tenantId,actor.user.tenantId))).for('update');
      const [q]=await tx.select().from(partQuotes).where(and(eq(partQuotes.id,id),eq(partQuotes.tenantId,actor.user.tenantId))).for('update');
      if(q.version!==input.expectedVersion)throw versionConflict(q.version);
      if(q.status!=='pending')throw badRequest('QUOTE_NOT_PENDING','این پیشنهاد منتظر پاسخ نیست');
      const kase=await this.cases.loadForWrite(tx,actor.user.tenantId,q.caseId);
      if(!['needed','rejected'].includes(part.status))throw badRequest('QUOTE_NOT_ALLOWED','قطعه قبلاً وارد مرحله خرید شده است');
      if(q.createdBy===actor.user.id&&!actor.user.isOwner)throw forbidden('ثبت‌کننده قیمت نمی‌تواند تأیید همان پیشنهاد را ثبت کند');
      const source=kase.coverageType==='golden_card'?'golden_card':kase.coverageType==='insurance'?'insurer':kase.coverageType==='personal'?'customer':null;
      if(source&&source!==input.source)throw badRequest('QUOTE_WRONG_SOURCE','مرجع تأیید با پوشش پرونده هماهنگ نیست');
      if(input.decision==='approved'&&q.validUntil<new Date())throw badRequest('QUOTE_EXPIRED','قیمت منقضی شده است؛ پیشنهاد تازه ثبت شود');
      const [row]=await tx.update(partQuotes).set({status:input.decision,source:input.source,reference:input.reference,approver:input.approver,note:input.note,decidedAt:new Date(),decidedBy:actor.user.id,version:q.version+1}).where(and(eq(partQuotes.id,id),eq(partQuotes.tenantId,actor.user.tenantId))).returning();
      await this.audit.record(tx,actor,{entityType:'part_quote',entityId:id,caseId:q.caseId,action:'part_quote.'+input.decision,before:{status:q.status},after:input,snapshot:{version:row.version,row}});
    });return this.quotes(actor);
  }
  async overview(actor:Actor):Promise<WorkshopOverview> {
    const taskRows=await this.taskList(actor),bs=await this.db.select().from(blockers).where(eq(blockers.tenantId,actor.user.tenantId));
    const now=new Date().toISOString();
    const caseStops=[...new Set(bs.map(b=>b.caseId))].map(caseId=>({caseId,minutes:unionElapsedMinutes(bs.filter(b=>b.caseId===caseId).map(b=>({start:b.occurredAt.toISOString(),end:iso(b.resolvedAt)??now}))),basis:'elapsed_union' as const}));
    return {tasks:taskRows,stations:await this.stations(actor),quotes:await this.quotes(actor),blockers:bs.map(b=>({id:b.id,caseId:b.caseId,reason:b.reason,description:b.description,occurredAt:b.occurredAt.toISOString(),resolvedAt:iso(b.resolvedAt),taskId:b.taskId})),caseStops};
  }
}
