import { and, eq, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/database';
import { receptions } from '../db/schema';

/**
 * Demo data next to real data (H4 part 5, owner 2026-11-28). Staging is the demo dealership and Pulse
 * reads real receptions into it: the seed's sample receptions (1405090201…) must then stay out of every
 * list, count and night list. With only demo receptions (development, browser tests) they stay visible.
 */
export async function hasRealReceptions(db: DbOrTx, tenantId: string): Promise<boolean> {
  const [row] = await db.select({ id: receptions.id }).from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(receptions.isDemo, false))).limit(1);
  return !!row;
}

/** Conditions to add to a reception query: none while the dealership has only demo receptions. */
export async function realReceptionsOnly(db: DbOrTx, tenantId: string): Promise<SQL[]> {
  return (await hasRealReceptions(db, tenantId)) ? [eq(receptions.isDemo, false)] : [];
}
