/**
 * Package-level workflow for a Smart Manual Assessment.
 * Pure decisions only. API integration MUST enforce tenant RBAC, transactional
 * persistence, audit events, financial approvals and procurement safeguards.
 */
export type AssessmentPackageStatus = 'draft' | 'submitted' | 'under_review' | 'finalized';
export type AssessmentPackageAction = 'submit' | 'begin_review' | 'finalize';
export interface AssessmentPackage {
  id:string;
  status:AssessmentPackageStatus;
  version:number;
  partCount:number;
  pendingTechnicalParts:number;
  returnedTechnicalParts:number;
  /** Existing procurement/reservation commitments must remain protected separately. */
  hasUnsafeDownstreamEdits:boolean;
}
export interface PackageTransition {
  ok:boolean;
  package:AssessmentPackage;
  code?:'STALE_VERSION'|'INVALID_TRANSITION'|'PARTS_REQUIRED'|'TECHNICAL_REVIEW_OPEN'|'DOWNSTREAM_REVIEW_REQUIRED';
}
export function advanceAssessmentPackage(
  state:AssessmentPackage,
  action:AssessmentPackageAction,
  expectedVersion:number,
):PackageTransition {
  if(state.version!==expectedVersion) return {ok:false,package:state,code:'STALE_VERSION'};
  const allowed:Record<AssessmentPackageAction,AssessmentPackageStatus> = {
    submit:'draft',begin_review:'submitted',finalize:'under_review',
  };
  if(state.status!==allowed[action])
    return {ok:false,package:state,code:'INVALID_TRANSITION'};
  if(state.partCount<1)
    return {ok:false,package:state,code:'PARTS_REQUIRED'};
  if(action==='finalize'){
    if(state.pendingTechnicalParts!==0||state.returnedTechnicalParts!==0)
      return {ok:false,package:state,code:'TECHNICAL_REVIEW_OPEN'};
    if(state.hasUnsafeDownstreamEdits)
      return {ok:false,package:state,code:'DOWNSTREAM_REVIEW_REQUIRED'};
  }
  const next:Record<AssessmentPackageAction,AssessmentPackageStatus>={
    submit:'submitted',begin_review:'under_review',finalize:'finalized',
  };
  return {ok:true,package:{...state,status:next[action],version:state.version+1}};
}

/** A technical line may be removed only before an irreversible supply commitment. */
export function canRemoveTechnicalLine(input:{
  reservedQuantity:number;orderedQuantity:number;deliveredQuantity:number;
}):boolean {
  return [input.reservedQuantity,input.orderedQuantity,input.deliveredQuantity].every(
    n=>Number.isInteger(n)&&n===0,
  );
}
