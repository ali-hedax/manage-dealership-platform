import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { KASB_FIELD_KEYS, type KasbFieldMap } from '@manage/shared';
import type { DbOrTx } from '../db/database';
import { receptionParts, receptionRepairs, receptions, tenants } from '../db/schema';
import { KASB_LINE_TEXT, PART_NAME_COLUMNS } from './kasb-protocol';

// Columns of کسب‌وکار the administrator confirmed in «منبع‌ها» (S08, owner 2026-11-28). Kept in the
// dealership settings (tenants.settings.kasbFieldMap). A confirmation never needs a new read: the
// official rows are stored whole, so the same values are taken from them in place.

const COLUMN_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Only well-formed column names survive (they are used as JSON keys, never as SQL identifiers). */
export function sanitizeFieldMap(raw: unknown): KasbFieldMap {
  const out: KasbFieldMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of KASB_FIELD_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && COLUMN_NAME.test(value)) out[key] = value;
  }
  return out;
}

export async function loadFieldMap(db: DbOrTx, tenantId: string): Promise<KasbFieldMap> {
  const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
  return sanitizeFieldMap(((t?.settings ?? {}) as { kasbFieldMap?: unknown }).kasbFieldMap);
}

/** The text of one key of a stored official row, cleaned like `cleanText` (Arabic ي/ى/ك, spaces, «null»). */
export function officialText(official: AnyPgColumn, column: string): SQL<string | null> {
  return sql<string | null>`nullif(nullif(btrim(regexp_replace(translate(${official} ->> (${column})::text, 'يىك', 'ییک'), ${'\\s+'}, ' ', 'g')), ''), 'null')`;
}

/** Lines typed into the manual file (kasb_line_id «m:…») carry their own values and are never re-derived. */
const pulseLine = (line: AnyPgColumn) => sql`${line} not like 'm:%'`;

/**
 * Re-derives the confirmed fields of every stored card and line of the dealership from the official
 * rows: labour name, technician and station, part name and «سالن تعمیرات». Unconfirmed fields go back
 * to their default source (labour name = GrprDesc, else the description; part name = the candidate columns) or empty.
 */
export async function applyFieldMap(tx: DbOrTx, tenantId: string, map: KasbFieldMap): Promise<void> {
  await tx.update(receptionRepairs).set({
    // Unconfirmed: the labour catalogue name GrprDesc, else the description (H4 part 2).
    name: map.repairName ? officialText(receptionRepairs.official, map.repairName) : sql`coalesce(${officialText(receptionRepairs.official, KASB_LINE_TEXT.repairName)}, ${receptionRepairs.description})`,
    technician: map.repairTechnician ? officialText(receptionRepairs.official, map.repairTechnician) : null,
    station: map.repairStation ? officialText(receptionRepairs.official, map.repairStation) : null,
  }).where(and(eq(receptionRepairs.tenantId, tenantId), pulseLine(receptionRepairs.kasbLineId)));
  const partName = map.partName
    ? officialText(receptionParts.official, map.partName)
    : sql<string | null>`coalesce(${sql.join(PART_NAME_COLUMNS.map((c) => officialText(receptionParts.official, c)), sql`, `)})`;
  await tx.update(receptionParts).set({ name: partName }).where(and(eq(receptionParts.tenantId, tenantId), pulseLine(receptionParts.kasbLineId)));
  await tx.update(receptions).set({ hall: map.cardHall ? officialText(receptions.official, map.cardHall) : null })
    .where(and(eq(receptions.tenantId, tenantId), eq(receptions.source, 'pulse')));
}
