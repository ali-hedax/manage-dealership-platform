import { z } from 'zod';
import type { TaskWage } from './people';

export const REPAIR_TRADES = ['mechanical', 'electrical', 'suspension', 'body', 'paint', 'engine_tuning'] as const;
export type RepairTrade = typeof REPAIR_TRADES[number];
export const REPAIR_TRADE_LABELS: Record<RepairTrade, string> = {
  mechanical: 'مکانیکی', electrical: 'برق و باتری‌سازی', suspension: 'جلوبندی',
  body: 'صافکاری', paint: 'نقاشی', engine_tuning: 'تنظیم موتور',
};
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, 'تاریخ معتبر نیست');
const shift = z.object({ start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(1440) }).refine(v => v.end > v.start, 'پایان بازه باید پس از شروع باشد');
export const calendarSchema = z.object({
  // JS weekday: Sunday=0 … Friday=5, Saturday=6. Minutes since Tehran midnight.
  week: z.array(z.array(shift).max(4)).length(7),
  holidays: z.array(z.object({ date: dateKey, title: z.string().trim().min(1).max(150), official: z.boolean(), source:z.literal('google_iran').optional() })).max(1000),
  holidaysVerifiedThrough: dateKey.nullable(),
}).superRefine((v,ctx) => {
  if (!v.week.some(day => day.length)) ctx.addIssue({ code:'custom',message:'حداقل یک بازه کاری لازم است',path:['week'] });
  v.week.forEach((day,i) => { const sorted=[...day].sort((a,b)=>a.start-b.start); if(sorted.some((s,j)=>j>0 && s.start<sorted[j-1]!.end)) ctx.addIssue({code:'custom',message:'بازه‌های کاری هم‌پوشانی دارند',path:['week',i]}); });
  if(new Set(v.holidays.map(h=>h.date)).size !== v.holidays.length) ctx.addIssue({code:'custom',message:'تاریخ تعطیلی تکراری است',path:['holidays']});
});
export type WorkCalendar = z.infer<typeof calendarSchema>;
export const DEFAULT_WORK_CALENDAR: WorkCalendar = {
  week: Array.from({length:7},(_,d)=> d===5 ? [] : d===4 ? [{start:480,end:780}] : [{start:480,end:780},{start:930,end:1110}]),
  holidays: [], holidaysVerifiedThrough: null,
};
export const saveCalendarSchema = z.object({ expectedVersion:z.number().int().min(0), effectiveFrom:dateKey, calendar:calendarSchema, reason:z.string().trim().min(3).max(1000) });
export const stationSchema = z.object({ code:z.string().trim().min(1).max(32), name:z.string().trim().min(1).max(120), trade:z.enum(REPAIR_TRADES), departmentId:z.uuid(), responsibleUserId:z.uuid().nullable(), isActive:z.boolean().default(true), expectedVersion:z.number().int().min(1).optional() });
export interface WorkshopStation extends z.infer<typeof stationSchema> { id:string; version:number }
export const quoteSchema = z.object({ expectedVersion:z.number().int().min(1), unitPriceRial:z.number().int().min(1).max(1e12), supplier:z.string().trim().min(1).max(200), validUntil:z.iso.datetime({offset:true}), note:z.string().trim().max(1000).optional() });
export const quoteDecisionSchema = z.object({ expectedVersion:z.number().int().min(1), decision:z.enum(['approved','rejected']), officialRecorded:z.boolean().optional(), source:z.enum(['golden_card','insurer','customer']), reference:z.string().trim().min(1).max(200), approver:z.string().trim().min(1).max(150), note:z.string().trim().min(3).max(1000) });
export interface PartQuote {
  id:string; partId:string; caseId:string; description:string; partNumber:string|null; caseNumber:string;
  quantity:number; unitPriceRial:number; supplier:string; validUntil:string; status:string;
  createdAt:string; decidedAt:string|null; source:string|null; reference:string|null; approver:string|null; note:string|null; version:number;
}
export interface CalendarRevision { id:string|null; version:number; effectiveFrom:string; calendar:WorkCalendar }
export interface WorkshopTask {
  /** Parts of this vehicle that arrived or are set aside and wait to be collected from the store. */
  partsReady?: { count: number; names: string[]; pickup?: { id: string; version: number; description: string }[] };
  /** Parts of this vehicle still on order (not yet arrived). */
  partsWaiting?: number;
  /** Own job cards only: the technician's own wage (never assessment or other people's amounts). */
  wage?: TaskWage | null;
  dayMinutes?:number|null;
  plannedWorkMinutes?:number|null;
  id:string; caseId:string; caseNumber:string; vehicleLabel:string; plate:string|null; title:string|null;
  stationCode:string|null; stationName:string|null; departmentName:string; technicianName:string|null;
  status:string; version:number; plannedStartAt:string|null; plannedEndAt:string|null; baselineEndAt:string|null;
  actualStartAt:string|null; actualEndAt:string|null; approvedAt:string|null; canStart:boolean;
  workMinutes:number|null; lateMinutes:number|null; transferMinutes:number|null; calendarConfirmed:boolean;
}
export interface WorkshopOverview {
  caseBudgets?:{caseId:string;caseNumber:string;days:number;dayMinutes:number;budgetMinutes:number;plannedMinutes:number;forecastEndAt:string}[];
  tasks:WorkshopTask[]; stations:WorkshopStation[]; quotes:PartQuote[];
  blockers:{id:string;caseId:string;reason:string;description:string|null;occurredAt:string;resolvedAt:string|null;taskId:string|null}[];
  // Per-case union of blocker intervals; never summed as independent causes.
  caseStops:{caseId:string;minutes:number;basis:'elapsed_union'}[];
}
const DAY=86_400_000, OFFSET=210*60_000;
function bounds(at:number) { const local=new Date(at+OFFSET); const key=local.toISOString().slice(0,10); return {key,weekday:local.getUTCDay(),midnight:Date.parse(key+'T00:00:00Z')-OFFSET}; }
function intervals(day:number,calendar:WorkCalendar) {
  const b=bounds(day);
  if(calendar.holidays.some(h=>h.date===b.key)) return [];
  return [...calendar.week[b.weekday]!].sort((a,b)=>a.start-b.start).map(s=>[b.midnight+s.start*60_000,b.midnight+s.end*60_000] as const);
}
/** True when the Tehran day (YYYY-MM-DD) has working hours and is not a recorded holiday (e.g. Friday). */
export function isWorkingDay(dateKey:string,calendar:WorkCalendar):boolean {
  if(calendar.holidays.some(h=>h.date===dateKey)) return false;
  const weekday=new Date(dateKey+'T12:00:00Z').getUTCDay();
  return (calendar.week[weekday]?.length??0)>0;
}
/** Manage's planning suggestion for one repair unit; the accident expert decides. */
export interface PlanSuggestion {
  departmentId:string; departmentName:string;
  suggestedDays:number; basis:'same_model'|'history'|'default'; samples:number;
  stations:{id:string;code:string;name:string;freeFrom:string|null;queuedCars:number}[];
  recommendedStationId:string|null; order:number;
}
export function addWorkingMinutes(start:string,minutes:number,calendar:WorkCalendar):string {
  let cursor=Date.parse(start),remaining=minutes*60_000;
  if(!Number.isFinite(cursor)||!Number.isFinite(minutes)||minutes<=0||minutes>1e6) throw new Error('INVALID_WORK_DURATION');
  for(let n=0;n<3660;n++) {
    for(const [a,b] of intervals(cursor,calendar)) { const from=Math.max(a,cursor);if(from>=b) continue;const usable=b-from;if(remaining<=usable)return new Date(from+remaining).toISOString();remaining-=usable; }
    cursor=bounds(cursor).midnight+DAY;
  }
  throw new Error('CALENDAR_RANGE_EXCEEDED');
}
export function workingMinutesBetween(start:string,end:string,calendar:WorkCalendar):number {
  const from=Date.parse(start),to=Date.parse(end);
  if(!Number.isFinite(from)||!Number.isFinite(to)) throw new Error('INVALID_WORK_TIME');
  if(to<=from)return 0;
  if(to-from>3660*DAY)throw new Error('CALENDAR_RANGE_EXCEEDED');
  let sum=0;
  for(let day=bounds(from).midnight;day<to;day+=DAY)for(const [a,b]of intervals(day,calendar))sum+=Math.max(0,Math.min(to,b)-Math.max(from,a));
  return Math.round(sum/60_000);
}
export function unionElapsedMinutes(ranges:{start:string;end:string}[]):number {
  const sorted=ranges.map(r=>[Date.parse(r.start),Date.parse(r.end)]).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b!>a!).sort((a,b)=>a[0]!-b[0]!);
  let sum=0,end=-Infinity;
  for(const [a,b]of sorted){sum+=Math.max(0,b!-Math.max(a!,end));end=Math.max(end,b!);}
  return Math.round(sum/60_000);
}

/** A day is one full configured working shift-day; short days consume fewer minutes. */
export function workingDayMinutes(calendar:WorkCalendar):number {return Math.max(...calendar.week.map(day=>day.reduce((n,s)=>n+s.end-s.start,0)));}
export interface RepairPlan {days:number;durationMinutes:number;dayMinutes:number;calendar:CalendarRevision;startAt:string;endAt:string}
export function repairDayPlan(startAt:string,days:number,calendar:CalendarRevision):RepairPlan {
 startAt=nextWorkingInstant(startAt,calendar.calendar);
 const dayMinutes=workingDayMinutes(calendar.calendar);const durationMinutes=Math.round(days*dayMinutes);
 return {days,durationMinutes,dayMinutes,calendar,startAt,endAt:addWorkingMinutes(startAt,durationMinutes,calendar.calendar)};
}
export function nextWorkingInstant(start:string,calendar:WorkCalendar):string {
 let cursor=Date.parse(start);if(!Number.isFinite(cursor))throw new Error('INVALID_WORK_START');
 for(let n=0;n<3660;n++){for(const [a,b] of intervals(cursor,calendar)){const from=Math.max(a,cursor);if(from<b)return new Date(from).toISOString();}cursor=bounds(cursor).midnight+DAY;}
 throw new Error('CALENDAR_RANGE_EXCEEDED');
}
export function unionWorkingMinutes(intervals:readonly {start:string;end:string}[],calendar:WorkCalendar):number {
 const sorted=intervals.filter(i=>Date.parse(i.end)>Date.parse(i.start)).map(i=>({start:Date.parse(i.start),end:Date.parse(i.end)})).sort((a,b)=>a.start-b.start);
 const merged:{start:number;end:number}[]=[];for(const i of sorted){const last=merged.at(-1);if(last&&i.start<=last.end)last.end=Math.max(last.end,i.end);else merged.push({...i});}
 return merged.reduce((n,i)=>n+workingMinutesBetween(new Date(i.start).toISOString(),new Date(i.end).toISOString(),calendar),0);
}
