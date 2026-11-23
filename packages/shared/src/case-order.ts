import { toLatinDigits } from './text';

/** Desk endpoints return the complete set; preserve admission order through local filtering. */
export function latestAdmissionFirst(
  a: { admittedAt: string; caseNumber: string; caseId: string },
  b: { admittedAt: string; caseNumber: string; caseId: string },
): number {
  return Date.parse(b.admittedAt) - Date.parse(a.admittedAt)
    || toLatinDigits(b.caseNumber).localeCompare(toLatinDigits(a.caseNumber), 'en', { numeric: true })
    || b.caseId.localeCompare(a.caseId);
}
