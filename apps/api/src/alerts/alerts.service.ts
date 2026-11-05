import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { AlertResponseInput, CaseAlert } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { caseAlertResponses, cases, partRequests, tenants, users, vehicles } from '../db/schema';
import { FinanceService } from '../finance/finance.service';

/** Owner decision 2026-11-05: 50,000,000 toman = 500,000,000 Rial. */
export const DEFAULT_PARTS_ALERT_THRESHOLD_RIAL = 500_000_000;

/**
 * Non-blocking alerts for the accident coordinator (owner rule 2026-11-05):
 * money never stops work; Manage asks, the coordinator answers, the answer is
 * recorded. Two kinds:
 *  - advance: the customer pays a share and no advance is recorded (level 1),
 *    or a supplement raised the cost after an advance (level 2);
 *  - parts_amount: the parts total crossed the threshold; each further
 *    multiple of the threshold is a new level and asks again.
 */
@Injectable()
export class AlertsService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly finance: FinanceService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  async threshold(tenantId: string): Promise<number> {
    const [t] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
    const v = t?.settings?.partsAlertThresholdRial;
    return typeof v === 'number' && v > 0 ? v : DEFAULT_PARTS_ALERT_THRESHOLD_RIAL;
  }

  async settings(actor: Actor) {
    return { partsAlertThresholdRial: await this.threshold(actor.user.tenantId), defaultRial: DEFAULT_PARTS_ALERT_THRESHOLD_RIAL };
  }

  async saveSettings(actor: Actor, partsAlertThresholdRial: number) {
    await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, actor.user.tenantId));
      const before = t!.settings ?? {};
      const after = { ...before, partsAlertThresholdRial };
      await tx.update(tenants).set({ settings: after }).where(eq(tenants.id, actor.user.tenantId));
      await this.audit.record(tx, actor, { entityType: 'tenant', entityId: actor.user.tenantId, action: 'settings.alerts_updated', before, after });
    });
    return this.settings(actor);
  }

  /** Open alerts for every open case of the tenant, or for one case. */
  async list(actor: Actor, caseId?: string): Promise<CaseAlert[]> {
    const tenantId = actor.user.tenantId;
    const open = await this.db
      .select({ id: cases.id, caseNumber: cases.caseNumber, coverageType: cases.coverageType, plate: vehicles.plate, model: vehicles.model })
      .from(cases)
      .innerJoin(vehicles, eq(vehicles.id, cases.vehicleId))
      .where(and(eq(cases.tenantId, tenantId), eq(cases.status, 'open'), caseId ? eq(cases.id, caseId) : undefined));
    if (!open.length) return [];
    const ids = open.map((c) => c.id);
    const [answers, partRows, threshold] = await Promise.all([
      this.db.select().from(caseAlertResponses).where(and(eq(caseAlertResponses.tenantId, tenantId), inArray(caseAlertResponses.caseId, ids))),
      this.db
        .select({ caseId: partRequests.caseId, quantity: partRequests.quantity, unit: partRequests.unitPriceRial, approved: partRequests.approvedUnitPriceRial })
        .from(partRequests)
        .where(and(eq(partRequests.tenantId, tenantId), inArray(partRequests.caseId, ids), ne(partRequests.status, 'cancelled'))),
      this.threshold(tenantId),
    ]);
    const answered = (id: string, kind: string, level: number) => answers.some((a) => a.caseId === id && a.kind === kind && a.level === level);
    const alerts: CaseAlert[] = [];
    for (const c of open) {
      const base = { caseId: c.id, caseNumber: c.caseNumber, plate: c.plate, vehicleLabel: c.model ?? '', coverageType: c.coverageType };
      const gate = await this.finance.gate(this.db, tenantId, c.id, 0);
      const advanceLevel = gate.reason === 're_approval_required' ? 2 : gate.reason === 'advance_missing' || gate.reason === 'shares_unknown' ? 1 : 0;
      if (advanceLevel && !answered(c.id, 'advance', advanceLevel)) {
        alerts.push({ ...base, kind: 'advance', level: advanceLevel, totalRial: null, thresholdRial: null });
      }
      const total = partRows.filter((p) => p.caseId === c.id).reduce((n, p) => n + (p.unit ?? p.approved ?? 0) * p.quantity, 0);
      const level = Math.floor(total / threshold);
      if (level >= 1 && !answered(c.id, 'parts_amount', level)) {
        alerts.push({ ...base, kind: 'parts_amount', level, totalRial: total, thresholdRial: threshold });
      }
    }
    return alerts;
  }

  /** Answer history of one case, newest first. */
  async history(actor: Actor, caseId: string) {
    const rows = await this.db
      .select({ a: caseAlertResponses, by: users.displayName })
      .from(caseAlertResponses)
      .innerJoin(users, eq(users.id, caseAlertResponses.respondedBy))
      .where(and(eq(caseAlertResponses.tenantId, actor.user.tenantId), eq(caseAlertResponses.caseId, caseId)));
    return rows
      .sort((x, y) => y.a.respondedAt.getTime() - x.a.respondedAt.getTime())
      .map(({ a, by }) => ({ kind: a.kind, level: a.level, response: a.response, note: a.note, respondedBy: by, respondedAt: a.respondedAt.toISOString() }));
  }

  async respond(actor: Actor, caseId: string, input: AlertResponseInput): Promise<CaseAlert[]> {
    const tenantId = actor.user.tenantId;
    const pending = await this.list(actor, caseId);
    const [kase] = await this.db.select({ id: cases.id }).from(cases).where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));
    if (!kase) throw notFound('پرونده');
    if (!pending.some((a) => a.kind === input.kind && a.level === input.level)) {
      throw badRequest('ALERT_NOT_OPEN', 'این هشدار برای پرونده باز نیست یا قبلاً جواب داده شده است');
    }
    await this.db.transaction(async (tx) => {
      const id = newId();
      try {
        await tx.insert(caseAlertResponses).values({ id, tenantId, caseId, kind: input.kind, level: input.level, response: input.response, note: input.note ?? null, respondedBy: actor.user.id });
      } catch {
        throw conflict('ALERT_ALREADY_ANSWERED', 'به این هشدار قبلاً جواب داده شده است');
      }
      await this.audit.record(tx, actor, { entityType: 'case', entityId: caseId, action: 'case.alert_answered', after: { kind: input.kind, level: input.level, response: input.response, note: input.note ?? null } });
    });
    return this.list(actor, caseId);
  }
}
