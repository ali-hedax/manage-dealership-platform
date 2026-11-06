import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  COVERAGE_BUCKETS,
  coverageBucket,
  type CaseWageRow,
  type CoverageBucket,
  type MyWorkMonth,
  type TaskWage,
  type WageHistoryEntry,
  type WageReport,
  type WageReportRow,
  type WageSetInput,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { auditEvents, cases, departments, tasks, technicianWages, users, vehicles } from '../db/schema';
import { PartsService } from '../parts/parts.service';
import { monthOptions, monthRange } from './responsibility.service';
import { ownWage } from './wage-view';

const technician = alias(users, 'wage_technician');
const setter = alias(users, 'wage_setter');
const iso = (d: Date | null) => d?.toISOString() ?? null;
const emptyBuckets = (): Record<CoverageBucket, number> => Object.fromEntries(COVERAGE_BUCKETS.map((b) => [b, 0])) as Record<CoverageBucket, number>;

/**
 * Technician wage per job, recorded by the accident coordinator and independent
 * from the assessment labour. It counts in the monthly work only after the
 * coordinator approved the handover of the job. Technicians reach only their
 * own amounts through /workshop/*; every other endpoint here needs a wage
 * permission they do not hold.
 */
@Injectable()
export class WagesService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly parts: PartsService,
  ) {}
  private get db() {
    return this.handle.db;
  }

  private assertCanRead(actor: Actor) {
    if (!actor.user.permissions.has('wage.manage') && !actor.user.permissions.has('wage.report')) throw forbidden();
  }

  /**
   * Assessment labour of each trade in a case, shared equally by the jobs of
   * that trade so two body jobs never both claim the full amount.
   */
  private async expertShares(db: DbOrTx, tenantId: string, caseIds: string[]): Promise<Map<string, number>> {
    const shares = new Map<string, number>();
    if (!caseIds.length) return shares;
    const jobs = await db
      .select({ id: tasks.id, caseId: tasks.caseId, departmentId: tasks.departmentId })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), inArray(tasks.caseId, caseIds)));
    for (const caseId of caseIds) {
      const lines = (await this.parts.authorizedLines(db, tenantId, caseId)) ?? [];
      const labour = new Map<string, number>();
      for (const l of lines) if (l.approved && l.item.labourDepartmentId && l.item.labourRial > 0) labour.set(l.item.labourDepartmentId, (labour.get(l.item.labourDepartmentId) ?? 0) + l.item.labourRial);
      const caseJobs = jobs.filter((j) => j.caseId === caseId);
      for (const j of caseJobs) {
        const total = labour.get(j.departmentId);
        if (!total) continue;
        shares.set(j.id, Math.round(total / caseJobs.filter((x) => x.departmentId === j.departmentId).length));
      }
    }
    return shares;
  }

  async caseWages(actor: Actor, caseId: string): Promise<CaseWageRow[]> {
    this.assertCanRead(actor);
    const tenantId = actor.user.tenantId;
    const [kase] = await this.db.select({ id: cases.id }).from(cases).where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));
    if (!kase) throw notFound('پرونده');
    const rows = await this.db
      .select({ t: tasks, department: departments.name, techName: technician.displayName, w: technicianWages, setterName: setter.displayName })
      .from(tasks)
      .innerJoin(departments, eq(departments.id, tasks.departmentId))
      .leftJoin(technician, eq(technician.id, tasks.assignedUserId))
      .leftJoin(technicianWages, and(eq(technicianWages.taskId, tasks.id), eq(technicianWages.tenantId, tenantId)))
      .leftJoin(setter, eq(setter.id, technicianWages.setBy))
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.caseId, caseId)))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
    const shares = await this.expertShares(this.db, tenantId, [caseId]);
    return rows.map(({ t, department, techName, w, setterName }) => ({
      taskId: t.id,
      title: t.title,
      departmentName: department,
      stationCode: t.stationSnapshot?.code ?? null,
      technician: t.assignedUserId ? { id: t.assignedUserId, displayName: techName ?? t.technicianName ?? '' } : null,
      status: t.status,
      approvedAt: iso(t.approvedAt),
      wageRial: w?.amountRial ?? null,
      reason: w?.reason ?? null,
      setAt: iso(w?.setAt ?? null),
      setBy: w ? setterName : null,
      version: w?.version ?? 0,
      expertShareRial: shares.get(t.id) ?? null,
    }));
  }

  async setWage(actor: Actor, taskId: string, input: WageSetInput): Promise<CaseWageRow[]> {
    const tenantId = actor.user.tenantId;
    let caseId = '';
    await this.db.transaction(async (tx) => {
      const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId))).for('update');
      if (!task) throw notFound('کار');
      caseId = task.caseId;
      if (!task.assignedUserId) throw badRequest('WAGE_NO_TECHNICIAN', 'ابتدا حساب تعمیرکار این کار را مشخص کنید');
      const [existing] = await tx.select().from(technicianWages).where(and(eq(technicianWages.taskId, taskId), eq(technicianWages.tenantId, tenantId))).for('update');
      const current = existing?.version ?? 0;
      if (current !== input.expectedVersion) throw versionConflict(current);
      const reason = input.reason?.trim() || null;
      const now = new Date();
      if (existing) {
        if (existing.amountRial === input.amountRial) return;
        if (!reason) throw badRequest('WAGE_REASON_REQUIRED', 'برای تغییر اجرت، دلیل را بنویسید؛ در تاریخچه می‌ماند');
        const [row] = await tx
          .update(technicianWages)
          .set({ amountRial: input.amountRial, reason, setBy: actor.user.id, setAt: now, version: existing.version + 1 })
          .where(and(eq(technicianWages.taskId, taskId), eq(technicianWages.version, existing.version)))
          .returning();
        if (!row) throw versionConflict();
        await this.audit.record(tx, actor, { entityType: 'task_wage', entityId: taskId, action: 'wage.changed', reason, occurredAt: now, before: { amountRial: existing.amountRial }, after: { amountRial: row.amountRial }, snapshot: { version: row.version, row } });
      } else {
        const [row] = await tx
          .insert(technicianWages)
          .values({ taskId, tenantId, caseId: task.caseId, amountRial: input.amountRial, reason, setBy: actor.user.id, setAt: now, isTest: actor.user.isTestTenant })
          .returning();
        await this.audit.record(tx, actor, { entityType: 'task_wage', entityId: taskId, action: 'wage.set', reason, occurredAt: now, after: { amountRial: input.amountRial }, snapshot: { version: 1, row: row! } });
      }
    });
    return this.caseWages(actor, caseId);
  }

  /** Every recorded amount of a job with who, when and why (read from the audit). */
  async history(actor: Actor, taskId: string): Promise<WageHistoryEntry[]> {
    this.assertCanRead(actor);
    const [task] = await this.db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, actor.user.tenantId)));
    if (!task) throw notFound('کار');
    const rows = await this.db
      .select({ e: auditEvents, actor: users.displayName })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(and(eq(auditEvents.tenantId, actor.user.tenantId), eq(auditEvents.entityType, 'task_wage'), eq(auditEvents.entityId, taskId), inArray(auditEvents.action, ['wage.set', 'wage.changed'])))
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id));
    return rows.map(({ e, actor: name }) => ({
      at: e.occurredAt.toISOString(),
      actor: name ?? null,
      beforeRial: (e.before as { amountRial?: number } | null)?.amountRial ?? null,
      afterRial: (e.after as { amountRial?: number } | null)?.amountRial ?? 0,
      reason: e.reason,
    }));
  }

  /** The technician confirms having seen the current amount (clears the "changed" label). */
  async markSeen(actor: Actor, taskId: string, expectedVersion: number): Promise<TaskWage> {
    const tenantId = actor.user.tenantId;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ w: technicianWages })
        .from(technicianWages)
        .innerJoin(tasks, and(eq(tasks.id, technicianWages.taskId), eq(tasks.tenantId, tenantId)))
        .where(and(eq(technicianWages.taskId, taskId), eq(technicianWages.tenantId, tenantId), eq(tasks.assignedUserId, actor.user.id)))
        .for('update');
      if (!row) throw notFound('اجرت این کار');
      if (row.w.version !== expectedVersion) throw versionConflict(row.w.version);
      if (row.w.seenAmountRial === row.w.amountRial) return ownWage(row.w);
      const now = new Date();
      const [updated] = await tx
        .update(technicianWages)
        .set({ seenAmountRial: row.w.amountRial, seenAt: now })
        .where(and(eq(technicianWages.taskId, taskId), eq(technicianWages.tenantId, tenantId)))
        .returning();
      await this.audit.record(tx, actor, { entityType: 'task_wage', entityId: taskId, action: 'wage.seen', occurredAt: now, after: { seenAmountRial: row.w.amountRial } });
      return ownWage(updated!);
    });
  }

  private approvedJobs(tenantId: string, from: Date, to: Date, technicianId?: string) {
    return this.db
      .select({ t: tasks, coverage: cases.coverageType, plate: vehicles.plate, brand: vehicles.brand, model: vehicles.model, department: departments.name, w: technicianWages, techName: technician.displayName })
      .from(tasks)
      .innerJoin(cases, and(eq(cases.id, tasks.caseId), eq(cases.tenantId, tenantId)))
      .innerJoin(vehicles, eq(vehicles.id, cases.vehicleId))
      .innerJoin(departments, eq(departments.id, tasks.departmentId))
      .innerJoin(technician, eq(technician.id, tasks.assignedUserId))
      .leftJoin(technicianWages, and(eq(technicianWages.taskId, tasks.id), eq(technicianWages.tenantId, tenantId)))
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.status, 'approved'),
          isNotNull(tasks.approvedAt),
          gte(tasks.approvedAt, from),
          lt(tasks.approvedAt, to),
          technicianId ? eq(tasks.assignedUserId, technicianId) : isNotNull(tasks.assignedUserId),
        ),
      )
      .orderBy(asc(tasks.approvedAt), asc(tasks.id));
  }

  /** "My work": own approved jobs of one Jalali month with totals per coverage. No assessment amounts. */
  async myWork(actor: Actor, month?: string): Promise<MyWorkMonth> {
    const range = monthRange(month);
    const rows = await this.approvedJobs(actor.user.tenantId, range.from, range.to, actor.user.id);
    const byCoverage = emptyBuckets();
    let totalRial = 0;
    let missingWage = 0;
    const out = rows.map(({ t, coverage, plate, brand, model, department, w }) => {
      const bucket = coverageBucket(coverage);
      if (w) {
        totalRial += w.amountRial;
        byCoverage[bucket] += w.amountRial;
      } else missingWage += 1;
      return { taskId: t.id, plate, vehicleLabel: [brand, model].filter(Boolean).join(' '), title: t.title || department, approvedAt: t.approvedAt!.toISOString(), wageRial: w?.amountRial ?? null, coverage: bucket };
    });
    return { month: range.key, label: range.label, months: monthOptions(), rows: out, totalRial, byCoverage, missingWage };
  }

  /** Paid wages against the assessment labour share, per technician, for the service manager and the owner. */
  async report(actor: Actor, month?: string): Promise<WageReport & { details: { technician: string; plate: string | null; title: string; approvedAt: string; coverage: CoverageBucket; wageRial: number | null; expertRial: number | null }[] }> {
    const range = monthRange(month);
    const tenantId = actor.user.tenantId;
    const rows = await this.approvedJobs(tenantId, range.from, range.to);
    const shares = await this.expertShares(this.db, tenantId, [...new Set(rows.map((r) => r.t.caseId))]);
    const byTech = new Map<string, WageReportRow>();
    for (const { t, w, techName } of rows) {
      const id = t.assignedUserId!;
      let r = byTech.get(id);
      if (!r) byTech.set(id, (r = { technician: { id, displayName: techName }, jobs: 0, paidRial: 0, expertRial: 0, differenceRial: 0, missingWage: 0 }));
      r.jobs += 1;
      r.expertRial += shares.get(t.id) ?? 0;
      if (w) r.paidRial += w.amountRial;
      else r.missingWage += 1;
    }
    const list = [...byTech.values()].map((r) => ({ ...r, differenceRial: r.paidRial - r.expertRial })).sort((a, b) => a.technician.displayName.localeCompare(b.technician.displayName, 'fa'));
    const totals = list.reduce((s, r) => ({ jobs: s.jobs + r.jobs, paidRial: s.paidRial + r.paidRial, expertRial: s.expertRial + r.expertRial, differenceRial: s.differenceRial + r.differenceRial }), { jobs: 0, paidRial: 0, expertRial: 0, differenceRial: 0 });
    return {
      month: range.key,
      label: range.label,
      months: monthOptions(),
      rows: list,
      totals,
      details: rows.map(({ t, w, techName, plate, department, coverage }) => ({ technician: techName, plate, title: t.title || department, approvedAt: t.approvedAt!.toISOString(), coverage: coverageBucket(coverage), wageRial: w?.amountRial ?? null, expertRial: shares.get(t.id) ?? null })),
    };
  }
}
