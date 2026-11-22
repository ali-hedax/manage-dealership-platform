/**
 * Deterministic, explainable employee score. Inputs are verified, role-specific
 * evidence ratios prepared by the analytics backend, NOT AI-generated guesses.
 * No employee ranking or financial attribution occurs here.
 */
export const EMPLOYEE_SCORE_WEIGHTS = {
  progress: 30, timeliness: 25, accuracy: 25, accountability: 20,
} as const;
export type EmployeeScoreDimension = keyof typeof EMPLOYEE_SCORE_WEIGHTS;
export type EmployeeRoleGroup = 'accident' | 'parts' | 'technician' | 'reception' | 'release';
export interface EmployeeScoreEvidence {
  /** Stable, authenticated employee ID; names are presentation only. */
  employeeId: string;
  displayName: string;
  roleGroup: EmployeeRoleGroup;
  /** Number of distinct, completed, eligible operational events. */
  eligibleCompletedEvents: number;
  /** Each ratio must be based on independently verified, role-specific denominators. */
  ratios: Partial<Record<EmployeeScoreDimension, number | null>>;
  /** Identifies how metric inputs were defined; never mix incomparable definitions. */
  metricVersion: string;
}
export interface EmployeeScoreResult {
  employeeId: string;
  displayName: string;
  roleGroup: EmployeeRoleGroup;
  score: number | null;
  breakdown: Record<EmployeeScoreDimension, number | null>;
  status: 'scored' | 'insufficient_data';
  eligibleCompletedEvents: number;
  formulaVersion: string;
  metricVersion: string;
}
/** Conservative starting requirement; business owners may review the threshold. */
export const MIN_SCORE_EVENTS = 5;
export const EMPLOYEE_SCORE_FORMULA_VERSION = '1.0.0';
const dimensions = Object.keys(EMPLOYEE_SCORE_WEIGHTS) as EmployeeScoreDimension[];

export function calculateEmployeeScore(input: EmployeeScoreEvidence): EmployeeScoreResult {
  if (!input.employeeId.trim()) throw new Error('EMPLOYEE_ID_REQUIRED');
  if (!Number.isSafeInteger(input.eligibleCompletedEvents) || input.eligibleCompletedEvents < 0)
    throw new Error('INVALID_EVENT_COUNT');
  const breakdown = {} as Record<EmployeeScoreDimension, number | null>;
  let complete = true;
  for (const dimension of dimensions) {
    const value = input.ratios[dimension];
    if (value == null) {
      breakdown[dimension] = null;
      complete = false;
    } else {
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new Error('INVALID_SCORE_RATIO');
      breakdown[dimension] = Math.round(value * EMPLOYEE_SCORE_WEIGHTS[dimension] * 100) / 100;
    }
  }
  const eligible = input.eligibleCompletedEvents >= MIN_SCORE_EVENTS && complete;
  const total = eligible
    ? Math.round(dimensions.reduce((sum, key) => sum + (breakdown[key] ?? 0), 0))
    : null;
  return {
    employeeId: input.employeeId, displayName: input.displayName,
    roleGroup: input.roleGroup, score: total, breakdown,
    status: eligible ? 'scored' : 'insufficient_data',
    eligibleCompletedEvents: input.eligibleCompletedEvents,
    formulaVersion: EMPLOYEE_SCORE_FORMULA_VERSION,
    metricVersion: input.metricVersion,
  };
}
