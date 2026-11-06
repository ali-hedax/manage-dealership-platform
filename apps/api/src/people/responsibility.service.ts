import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import {
  jalaliMonthKey,
  jalaliMonthLabel,
  jalaliMonthRange,
  recentJalaliMonths,
  type ResponsibilityPeriod,
  type ResponsibilityReport,
  type ResponsibilityReportRow,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { periodsOf, responsibleAt, type PeriodRow } from '../cases/responsibility';
import { badRequest, notFound } from '../common/errors';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { caseResponsibilityPeriods, cases, tasks, users } from '../db/schema';

export const monthOptions = () => recentJalaliMonths(12).map((key) => ({ key, label: jalaliMonthLabel(key) }));

export function monthRange(month: string | undefined) {
  const key = month ?? jalaliMonthKey();
  const range = jalaliMonthRange(key);
  if (!range) throw badRequest('INVALID_MONTH', 'ماه انتخاب‌شده معتبر نیست');
  return { key, ...range };
}

/** Responsibility periods of a case and the statistics that follow each person's own period. */
@Injectable()
export class ResponsibilityService {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle) {}
  private get db() {
    return this.handle.db;
  }

  async periods(actor: Actor, caseId: string): Promise<ResponsibilityPeriod[]> {
    const [kase] = await this.db.select().from(cases).where(and(eq(cases.id, caseId), eq(cases.tenantId, actor.user.tenantId)));
    if (!kase) throw notFound('پرونده');
    return (await periodsOf(this.db, kase)).map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      startedAt: p.startedAt.toISOString(),
      endedAt: p.endedAt?.toISOString() ?? null,
      reason: p.reason,
      derived: p.derived,
    }));
  }

  /**
   * Per accident coordinator for one Jalali month: cases held, days held (each
   * period clipped to the month and to the case's handover), jobs approved and
   * vehicles delivered while that person was responsible.
   */
  async report(actor: Actor, month?: string, now = new Date()): Promise<ResponsibilityReport> {
    const range = monthRange(month);
    const tenantId = actor.user.tenantId;
    const caseRows = await this.db
      .select({ id: cases.id, tenantId: cases.tenantId, admittedAt: cases.admittedAt, responsibleUserId: cases.responsibleUserId, isTest: cases.isTest, actualDeliveryAt: cases.actualDeliveryAt, status: cases.status, updatedAt: cases.updatedAt })
      .from(cases)
      .where(and(eq(cases.tenantId, tenantId), lt(cases.admittedAt, range.to)));
    const recorded = await this.db
      .select({ p: caseResponsibilityPeriods, name: users.displayName })
      .from(caseResponsibilityPeriods)
      .innerJoin(users, eq(users.id, caseResponsibilityPeriods.userId))
      .where(eq(caseResponsibilityPeriods.tenantId, tenantId))
      .orderBy(asc(caseResponsibilityPeriods.startedAt), asc(caseResponsibilityPeriods.createdAt));
    const staff = await this.db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.tenantId, tenantId));
    const nameOf = new Map(staff.map((u) => [u.id, u.name]));
    const byCase = new Map<string, PeriodRow[]>();
    for (const { p, name } of recorded) {
      const list = byCase.get(p.caseId) ?? [];
      list.push({ userId: p.userId, displayName: name, startedAt: p.startedAt, endedAt: p.endedAt, reason: p.reason, derived: false });
      byCase.set(p.caseId, list);
    }
    const periodsFor = (c: (typeof caseRows)[number]): PeriodRow[] =>
      byCase.get(c.id) ?? (c.responsibleUserId ? [{ userId: c.responsibleUserId, displayName: nameOf.get(c.responsibleUserId) ?? '', startedAt: c.admittedAt, endedAt: null, reason: null, derived: true }] : []);

    const stats = new Map<string, { cases: Set<string>; minutes: number; approvedTasks: number; delivered: number }>();
    const of = (userId: string) => {
      let s = stats.get(userId);
      if (!s) stats.set(userId, (s = { cases: new Set(), minutes: 0, approvedTasks: 0, delivered: 0 }));
      return s;
    };
    const periodsByCase = new Map<string, PeriodRow[]>();
    for (const c of caseRows) {
      const periods = periodsFor(c);
      periodsByCase.set(c.id, periods);
      const caseEnd = c.actualDeliveryAt ?? (c.status !== 'open' ? c.updatedAt : null);
      const end = Math.min(range.to.getTime(), now.getTime(), caseEnd?.getTime() ?? Infinity);
      for (const p of periods) {
        const from = Math.max(p.startedAt.getTime(), range.from.getTime());
        const to = Math.min(p.endedAt?.getTime() ?? Infinity, end);
        if (to <= from) continue;
        const s = of(p.userId);
        s.cases.add(c.id);
        s.minutes += (to - from) / 60_000;
      }
      if (c.actualDeliveryAt && c.actualDeliveryAt >= range.from && c.actualDeliveryAt < range.to) {
        const who = responsibleAt(periods, c.actualDeliveryAt);
        if (who) of(who).delivered += 1;
      }
    }
    const approved = await this.db
      .select({ caseId: tasks.caseId, approvedAt: tasks.approvedAt })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), isNotNull(tasks.approvedAt), gte(tasks.approvedAt, range.from), lt(tasks.approvedAt, range.to)));
    for (const t of approved) {
      const who = responsibleAt(periodsByCase.get(t.caseId) ?? [], t.approvedAt!);
      if (who) of(who).approvedTasks += 1;
    }
    const rows: ResponsibilityReportRow[] = [...stats.entries()]
      .map(([id, s]) => ({ user: { id, displayName: nameOf.get(id) ?? '' }, cases: s.cases.size, heldDays: Math.round((s.minutes / 1440) * 10) / 10, approvedTasks: s.approvedTasks, delivered: s.delivered }))
      .filter((r) => r.cases || r.approvedTasks || r.delivered)
      .sort((a, b) => b.cases - a.cases || a.user.displayName.localeCompare(b.user.displayName, 'fa'));
    return { month: range.key, label: range.label, months: monthOptions(), rows };
  }
}
