import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { BlockerReason, CaseStage, CoverageType, DashboardSummary } from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { caseSql, flagConditions } from '../cases/cases.service';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { blockers, cases, departments, tasks } from '../db/schema';

// Each count uses the same SQL condition as the matching case-list filter,
// so a dashboard card always opens exactly the cases it counted.
const STALE_BLOCKER_HOURS = 24;

@Injectable()
export class DashboardService {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle) {}

  async summary(actor: Actor): Promise<DashboardSummary> {
    const db = this.handle.db;
    const tenantId = actor.user.tenantId;
    const tenantCases = eq(cases.tenantId, tenantId);
    const count = (cond: ReturnType<typeof sql>) => sql<number>`(count(*) filter (where ${cond}))::int`;

    const [totals] = await db
      .select({
        activeCases: count(caseSql.active),
        overdue: count(flagConditions.overdue!()),
        dueSoon: count(flagConditions.due_soon!()),
        blockedCases: count(flagConditions.blocked!()),
        needsCompletion: count(flagConditions.needs_completion!()),
        unassigned: count(flagConditions.unassigned!()),
        readyForDelivery: count(flagConditions.ready!()),
        legacyEntries: count(flagConditions.legacy!()),
        awaitingAuthorization: count(flagConditions.awaiting_authorization!()),
        partsOverdue: count(flagConditions.parts_overdue!()),
        partsToOrder: count(flagConditions.parts_to_order!()),
        financePending: count(flagConditions.finance_pending!()),
      })
      .from(cases)
      .where(tenantCases);

    const byStage = await db
      .select({ stage: cases.stage, count: sql<number>`count(*)::int` })
      .from(cases)
      .where(and(tenantCases, eq(cases.status, 'open')))
      .groupBy(cases.stage);

    const byCoverage = await db
      .select({ coverage: cases.coverageType, count: sql<number>`count(*)::int` })
      .from(cases)
      .where(and(tenantCases, caseSql.active))
      .groupBy(cases.coverageType);

    const openBlockers = and(eq(blockers.tenantId, tenantId), isNull(blockers.resolvedAt));
    const byReason = await db
      .select({ reason: blockers.reason, count: sql<number>`count(*)::int` })
      .from(blockers)
      .where(openBlockers)
      .groupBy(blockers.reason);

    const [stale] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(blockers)
      .where(
        and(
          openBlockers,
          sql`coalesce(${blockers.lastFollowUpAt}, ${blockers.recordedAt}) < now() - make_interval(hours => ${STALE_BLOCKER_HOURS})`,
        ),
      );

    const deptRows = await db
      .select({
        id: departments.id,
        name: departments.name,
        inProgress: sql<number>`(count(${tasks.id}) filter (where ${tasks.status} = 'in_progress' and ${cases.status} = 'open'))::int`,
        blocked: sql<number>`(count(${tasks.id}) filter (where ${tasks.status} = 'blocked' and ${cases.status} = 'open'))::int`,
        pending: sql<number>`(count(${tasks.id}) filter (where ${tasks.status} = 'pending' and ${cases.status} = 'open'))::int`,
      })
      .from(departments)
      .leftJoin(tasks, eq(tasks.departmentId, departments.id))
      .leftJoin(cases, eq(cases.id, tasks.caseId))
      .where(and(eq(departments.tenantId, tenantId), eq(departments.isActive, true)))
      .groupBy(departments.id, departments.name, departments.sortOrder)
      .orderBy(asc(departments.sortOrder));

    return {
      generatedAt: new Date().toISOString(),
      ...totals!,
      byStage: byStage.map((r) => ({ stage: r.stage as CaseStage, count: r.count })),
      byCoverage: byCoverage.map((r) => ({ coverage: r.coverage as CoverageType, count: r.count })),
      openBlockersByReason: byReason.map((r) => ({ reason: r.reason as BlockerReason, count: r.count })),
      staleBlockers: stale!.n,
      departments: deptRows,
    };
  }
}
