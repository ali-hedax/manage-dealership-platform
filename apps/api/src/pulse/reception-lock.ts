import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/database';

/**
 * Serialises the writes of one admission number between Pulse and the manual «پذیرش و ریز کارت» file
 * (S08: the admission number is the key). PostgreSQL only; PGlite is one connection, so writes are serial anyway.
 */
export async function lockAdmission(tx: DbOrTx, driver: string, tenantId: string, admissionKey: string | null): Promise<void> {
  if (driver !== 'postgres' || !admissionKey) return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`reception:${tenantId}:${admissionKey}`}, 0))`);
}
