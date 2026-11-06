import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Actor } from '../auth/auth.types';
import { newId } from '../common/ids';
import type { DbOrTx } from '../db/database';
import { caseResponsibilityPeriods, cases, users } from '../db/schema';

type CaseRow = typeof cases.$inferSelect;
type CaseRef = Pick<CaseRow, 'id' | 'tenantId' | 'admittedAt' | 'responsibleUserId' | 'isTest'>;

export interface PeriodRow {
  userId: string;
  displayName: string;
  startedAt: Date;
  endedAt: Date | null;
  reason: string | null;
  derived: boolean;
}

/** A new case with a responsible starts its first period at the real admission time. */
export async function recordInitialResponsibility(tx: DbOrTx, actor: Actor, kase: CaseRef): Promise<void> {
  if (!kase.responsibleUserId) return;
  await tx.insert(caseResponsibilityPeriods).values({
    id: newId(),
    tenantId: kase.tenantId,
    caseId: kase.id,
    userId: kase.responsibleUserId,
    startedAt: kase.admittedAt,
    origin: 'created',
    createdBy: actor.user.id,
    isTest: kase.isTest,
  });
}

/**
 * Closes the open period and opens the next one. A case recorded before
 * periods existed has none: its computed first period (admission → now, the
 * current responsible) is written first, so earlier data is never rewritten.
 */
export async function recordResponsibilityChange(
  tx: DbOrTx,
  actor: Actor,
  current: CaseRef,
  nextUserId: string | null,
  at: Date,
  origin: 'transfer' | 'update',
  reason: string | null,
): Promise<void> {
  if ((current.responsibleUserId ?? null) === (nextUserId ?? null)) return;
  const scope = and(eq(caseResponsibilityPeriods.tenantId, current.tenantId), eq(caseResponsibilityPeriods.caseId, current.id));
  const [existing] = await tx.select({ id: caseResponsibilityPeriods.id }).from(caseResponsibilityPeriods).where(scope).limit(1);
  if (!existing && current.responsibleUserId) {
    await tx.insert(caseResponsibilityPeriods).values({
      id: newId(),
      tenantId: current.tenantId,
      caseId: current.id,
      userId: current.responsibleUserId,
      startedAt: current.admittedAt.getTime() < at.getTime() ? current.admittedAt : at,
      endedAt: at,
      origin: 'initial',
      createdBy: actor.user.id,
      isTest: current.isTest,
    });
  } else {
    await tx.update(caseResponsibilityPeriods).set({ endedAt: at }).where(and(scope, isNull(caseResponsibilityPeriods.endedAt)));
  }
  if (nextUserId) {
    await tx.insert(caseResponsibilityPeriods).values({
      id: newId(),
      tenantId: current.tenantId,
      caseId: current.id,
      userId: nextUserId,
      startedAt: at,
      reason,
      origin,
      createdBy: actor.user.id,
      isTest: current.isTest,
    });
  }
}

/** Recorded periods, or the computed single period of a case without any. */
export async function periodsOf(db: DbOrTx, kase: CaseRef): Promise<PeriodRow[]> {
  const rows = await db
    .select({ p: caseResponsibilityPeriods, name: users.displayName })
    .from(caseResponsibilityPeriods)
    .innerJoin(users, eq(users.id, caseResponsibilityPeriods.userId))
    .where(and(eq(caseResponsibilityPeriods.tenantId, kase.tenantId), eq(caseResponsibilityPeriods.caseId, kase.id)))
    .orderBy(asc(caseResponsibilityPeriods.startedAt), asc(caseResponsibilityPeriods.createdAt));
  if (rows.length) {
    return rows.map(({ p, name }) => ({ userId: p.userId, displayName: name, startedAt: p.startedAt, endedAt: p.endedAt, reason: p.reason, derived: false }));
  }
  if (!kase.responsibleUserId) return [];
  const [u] = await db.select({ name: users.displayName }).from(users).where(and(eq(users.id, kase.responsibleUserId), eq(users.tenantId, kase.tenantId)));
  return [{ userId: kase.responsibleUserId, displayName: u?.name ?? '', startedAt: kase.admittedAt, endedAt: null, reason: null, derived: true }];
}

/** The responsible at an instant (used to attribute report events to the period they happened in). */
export function responsibleAt(periods: readonly PeriodRow[], at: Date): string | null {
  const t = at.getTime();
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i]!;
    if (p.startedAt.getTime() <= t && (!p.endedAt || p.endedAt.getTime() > t)) return p.userId;
  }
  return null;
}
