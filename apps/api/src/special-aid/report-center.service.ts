import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';
import { REPORT_CENTER_DEFAULTS, REPORT_CENTER_KINDS, type ReportCenterEntry, type ReportCenterKind, type ReportCenterSaveInput } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { forbidden } from '../common/errors';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { dailyReportImports, dailyTasks, referenceImports, tenants } from '../db/schema';

type Stored = Partial<Record<ReportCenterKind, { guide?: string; pastDays?: number; futureDays?: number; updatedAt?: string }>>;
const DAY = 86_400_000;

/** «مرکز گزارش‌های کسب‌وکار» (spec section 25): guides, periods and import status of the three ISACO reports. */
@Injectable()
export class ReportCenterService {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle, private readonly audit: AuditService) {}
  private get db() { return this.handle.db; }
  private allowed(actor: Actor) {
    const p = actor.user.permissions;
    if (!(p.has('report_center.manage') || p.has('daily_reports.upload') || p.has('reference.customers.manage'))) throw forbidden();
  }

  async list(actor: Actor): Promise<ReportCenterEntry[]> {
    this.allowed(actor);
    const tenantId = actor.user.tenantId;
    const [t] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
    const stored = ((t?.settings ?? {}) as { reportCenter?: Stored }).reportCenter ?? {};
    const [emdad] = await this.db.select().from(dailyReportImports).where(and(eq(dailyReportImports.tenantId, tenantId), eq(dailyReportImports.kind, 'emdad'), eq(dailyReportImports.status, 'applied'))).orderBy(desc(dailyReportImports.appliedAt)).limit(1);
    const [reception] = await this.db.select({ fileName: referenceImports.fileName, appliedAt: referenceImports.appliedAt, rows: referenceImports.rows }).from(referenceImports).where(and(eq(referenceImports.tenantId, tenantId), eq(referenceImports.kind, 'customers'), eq(referenceImports.status, 'applied'))).orderBy(desc(referenceImports.appliedAt)).limit(1);
    // A missed day is a past daily task of the special-aid report that was never completed.
    const since = new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10);
    const today = new Date(Date.now() + 210 * 60_000).toISOString().slice(0, 10);
    const missed = await this.db.select({ day: dailyTasks.localDate }).from(dailyTasks).where(and(eq(dailyTasks.tenantId, tenantId), eq(dailyTasks.kind, 'emdad'), eq(dailyTasks.status, 'pending'), gte(dailyTasks.localDate, since)));
    return REPORT_CENTER_KINDS.map((kind) => {
      const s = stored[kind] ?? {};
      const base = REPORT_CENTER_DEFAULTS[kind];
      const counts = (emdad?.counts ?? {}) as Record<string, number>;
      const lastImport = kind === 'emdad' && emdad?.appliedAt
        ? { fileName: emdad.fileName, reportAt: emdad.reportAt?.toISOString() ?? null, appliedAt: emdad.appliedAt.toISOString(), rows: counts.total ?? null, errors: (counts.invalid ?? 0) + (counts.ambiguous ?? 0) + (counts.duplicate ?? 0) }
        : kind === 'reception' && reception?.appliedAt
          ? { fileName: reception.fileName, reportAt: null, appliedAt: reception.appliedAt.toISOString(), rows: Array.isArray(reception.rows) ? reception.rows.length : null, errors: Array.isArray(reception.rows) ? (reception.rows as { outcome?: string }[]).filter((r) => r.outcome === 'error').length : null }
          : null;
      return {
        ...base, kind, guide: s.guide ?? base.guide, pastDays: s.pastDays ?? base.pastDays, futureDays: s.futureDays ?? base.futureDays,
        supported: kind !== 'appointments', lastImport,
        missingDays: kind === 'emdad' ? missed.map((m) => m.day).filter((d) => d < today).sort() : [],
        updatedAt: s.updatedAt ?? null,
      };
    });
  }

  async save(actor: Actor, input: ReportCenterSaveInput) {
    if (!actor.user.permissions.has('report_center.manage')) throw forbidden();
    await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, actor.user.tenantId)).for('update');
      const before = (t!.settings ?? {}) as Record<string, unknown> & { reportCenter?: Stored };
      const center: Stored = { ...(before.reportCenter ?? {}), [input.kind]: { guide: input.guide, pastDays: input.pastDays, futureDays: input.futureDays, updatedAt: new Date().toISOString() } };
      await tx.update(tenants).set({ settings: { ...before, reportCenter: center } }).where(eq(tenants.id, actor.user.tenantId));
      await this.audit.record(tx, actor, { entityType: 'tenant', entityId: actor.user.tenantId, action: 'settings.report_center_updated', before: { [input.kind]: before.reportCenter?.[input.kind] ?? null }, after: { [input.kind]: center[input.kind] } });
    });
    return this.list(actor);
  }
}
