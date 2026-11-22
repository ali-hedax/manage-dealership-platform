/**
 * Safe, person-based attribution for a deliberately limited event allowlist.
 * Page views and merely suggested actions are NOT productive outcomes.
 * API should supply events filtered by tenant, reporting period and permissions.
 */
export const MEANINGFUL_STAFF_EVENTS = {
  'assessment.created': 'assessment_created',
  'assessment.finalized': 'assessment_finalized',
  'task.started': 'work_started',
  'task.completed': 'work_completed',
  'task.approved': 'work_approved',
} as const;
export type MeaningfulStaffOutcome = typeof MEANINGFUL_STAFF_EVENTS[keyof typeof MEANINGFUL_STAFF_EVENTS];
export interface StaffAuditEvent {
  id:string;
  actorUserId:string|null;
  action:string;
  occurredAt:string;
  isTest:boolean;
}
export interface IndividualActivity {
  employeeId:string;
  counts:Partial<Record<MeaningfulStaffOutcome,number>>;
  total:number;
}
export interface ActivityAggregation {
  employees:IndividualActivity[];
  unattributed:number;
  ignored:number;
}

/** Identity is the authenticated actor, NOT a display name, assignee or role. */
export function aggregateStaffActivity(events:readonly StaffAuditEvent[]):ActivityAggregation {
  const byId=new Map<string,IndividualActivity>();
  const seen=new Set<string>();
  let unattributed=0,ignored=0;
  for(const event of events){
    if(seen.has(event.id))continue;
    seen.add(event.id);
    if(event.isTest || !Number.isFinite(Date.parse(event.occurredAt))){ignored++;continue;}
    const outcome=MEANINGFUL_STAFF_EVENTS[event.action as keyof typeof MEANINGFUL_STAFF_EVENTS];
    if(!outcome){ignored++;continue;}
    if(!event.actorUserId?.trim()){unattributed++;continue;}
    const current=byId.get(event.actorUserId)??{employeeId:event.actorUserId,counts:{},total:0};
    current.counts[outcome]=(current.counts[outcome]??0)+1;
    current.total++;
    byId.set(event.actorUserId,current);
  }
  return {employees:[...byId.values()].sort((a,b)=>a.employeeId.localeCompare(b.employeeId)),unattributed,ignored};
}
