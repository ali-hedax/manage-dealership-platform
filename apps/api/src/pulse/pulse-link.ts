import { and, eq, inArray, ne } from 'drizzle-orm';
import type { DbOrTx } from '../db/database';
import { cases, vehicles } from '../db/schema';
import { fullVinKey } from './pulse-map';

export interface CaseLink {
  state: 'none' | 'linked' | 'ambiguous';
  caseIds: string[];
}

/**
 * The accident case of an admission: same admission matching key (admission_no_key) or the same
 * full 17-character VIN, and only when exactly one case qualifies (spec section 26). Deleted
 * cases never count. Read only: nothing in the accident case changes.
 */
export async function findCaseLink(tx: DbOrTx, tenantId: string, admissionNoKey: string | null, vin: string | null): Promise<CaseLink> {
  const ids = new Set<string>();
  if (admissionNoKey) {
    const rows = await tx.select({ id: cases.id }).from(cases).where(and(eq(cases.tenantId, tenantId), eq(cases.admissionNoKey, admissionNoKey), ne(cases.status, 'deleted')));
    for (const r of rows) ids.add(r.id);
  }
  const fullVin = fullVinKey(vin);
  if (fullVin) {
    const rows = await tx.select({ id: cases.id }).from(cases).innerJoin(vehicles, eq(vehicles.id, cases.vehicleId)).where(and(eq(cases.tenantId, tenantId), eq(vehicles.vin, fullVin), ne(cases.status, 'deleted')));
    for (const r of rows) ids.add(r.id);
  }
  return { state: ids.size === 1 ? 'linked' : ids.size > 1 ? 'ambiguous' : 'none', caseIds: [...ids] };
}

/** Case numbers of the given cases (for the review list). */
export async function caseNumbers(tx: DbOrTx, tenantId: string, ids: string[]) {
  if (!ids.length) return [];
  return tx.select({ caseId: cases.id, caseNumber: cases.caseNumber }).from(cases).where(and(eq(cases.tenantId, tenantId), inArray(cases.id, ids)));
}
