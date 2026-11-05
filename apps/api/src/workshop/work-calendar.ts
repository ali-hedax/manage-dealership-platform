import {desc,eq} from 'drizzle-orm';
import {DEFAULT_WORK_CALENDAR,type CalendarRevision} from '@manage/shared';
import type {DbOrTx} from '../db/database';
import {workCalendars} from '../db/schema';

export async function calendarAt(db:DbOrTx,tenantId:string,date:string):Promise<CalendarRevision> {
  const rows=await db.select().from(workCalendars).where(eq(workCalendars.tenantId,tenantId)).orderBy(desc(workCalendars.effectiveFrom),desc(workCalendars.version));
  const day=new Date(Date.parse(date)+210*60_000).toISOString().slice(0,10);
  const row=rows.find(r=>r.effectiveFrom<=day);
  return row ? {id:row.id,version:row.version,effectiveFrom:row.effectiveFrom,calendar:row.calendar} : {id:null,version:0,effectiveFrom:'2000-01-01',calendar:DEFAULT_WORK_CALENDAR};
}
