import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { daysInShop, shortVehicleName, type AccidentDecisionInput, type AccidentSuggestion, type AccidentSuggestionCase } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, conflict, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { APP_CONFIG, type AppConfig } from '../config';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { cases, receptionEvents, receptions, vehicles } from '../db/schema';
import { hasRealReceptions } from './demo-data';
import { CARD } from './kasb-protocol';

/** How many recent open cases the picker offers besides the ones of the same car. */
const RECENT_CASES = 30;
const plateKey = (plate: string | null | undefined) => (plate ?? '').replace(/[\s\-‌]/g, '');

/**
 * «پیشنهاد تصادفی» (H4 part 6, owner 2026-11-28). کسب‌وکار's «احتمال تصادفی» (DrcdAccident = 1) is not
 * reliable: a flagged card never becomes a case by itself. Open flagged cards without a case wait on
 * the accident expert's desk; the expert links one to an accident case (linkState «linked») or rejects
 * it («rejected»: not suggested again). Nothing is written to کسب‌وکار.
 */
@Injectable()
export class AccidentSuggestionsService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  private ensureActive() {
    if (!this.cfg.PULSE_ENABLED) throw badRequest('RECEPTION_DISABLED', 'بخش پذیرش و ترخیص هنوز روی این سرور فعال نشده است.');
  }

  /** Open cases a card can be linked to: never deleted or closed, never a demo case next to real data. */
  private async openCases(tenantId: string) {
    const real = await hasRealReceptions(this.db, tenantId);
    return this.db.select({ id: cases.id, caseNumber: cases.caseNumber, plate: vehicles.plate, vin: vehicles.vin, chassis: vehicles.chassisRef, model: vehicles.model, createdAt: cases.createdAt })
      .from(cases).leftJoin(vehicles, eq(vehicles.id, cases.vehicleId))
      .where(and(eq(cases.tenantId, tenantId), eq(cases.status, 'open'), ...(real ? [eq(cases.isDemo, false)] : [])))
      .orderBy(desc(cases.createdAt));
  }

  async list(actor: Actor): Promise<AccidentSuggestion[]> {
    this.ensureActive();
    const tenantId = actor.user.tenantId;
    const real = await hasRealReceptions(this.db, tenantId);
    const rows = await this.db.select().from(receptions)
      .where(and(eq(receptions.tenantId, tenantId), eq(receptions.isOpen, true), isNull(receptions.caseId), eq(receptions.linkState, 'none'),
        sql`${receptions.official} ->> ${CARD.accident} = '1'`, ...(real ? [eq(receptions.isDemo, false)] : [])))
      .orderBy(desc(receptions.admittedAt)).limit(200);
    if (!rows.length) return [];
    const open = await this.openCases(tenantId);
    const now = Date.now();
    return rows.map((r) => {
      const same = (c: (typeof open)[number]) => (!!r.vin && c.vin === r.vin) || (!!r.chassis && !!c.chassis && c.chassis.toUpperCase() === r.chassis.toUpperCase()) || (!!r.plate && plateKey(c.plate) === plateKey(r.plate));
      const view = (c: (typeof open)[number], matches: boolean): AccidentSuggestionCase => ({ id: c.id, caseNumber: c.caseNumber, plate: c.plate, vehicle: c.model, matches });
      const matching = open.filter(same);
      const others = open.filter((c) => !same(c)).slice(0, RECENT_CASES);
      return {
        receptionId: r.id, version: r.version, admissionNo: r.admissionNo, plate: r.plate,
        vehicleName: r.productName || r.modelName ? shortVehicleName(r.productName, r.productName ?? r.modelName) : null,
        customerName: r.customerName, admittedAt: r.admittedAt?.toISOString() ?? null, statusText: r.statusText ?? r.statusCode,
        daysIn: r.admittedAt ? daysInShop(r.admittedAt.toISOString(), now) : null,
        cases: [...matching.map((c) => view(c, true)), ...others.map((c) => view(c, false))],
      };
    });
  }

  async decide(actor: Actor, receptionId: string, input: AccidentDecisionInput): Promise<{ receptionId: string; linkState: string; caseId: string | null }> {
    this.ensureActive();
    const tenantId = actor.user.tenantId;
    return this.db.transaction(async (tx) => {
      const [r] = await tx.select().from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(receptions.id, receptionId))).for('update');
      if (!r) throw notFound('پذیرش');
      if (r.version !== input.expectedVersion) throw versionConflict(r.version);
      if (r.caseId || r.linkState !== 'none') throw conflict('ACCIDENT_ALREADY_DECIDED', 'برای این پذیرش قبلاً تصمیم گرفته شده است.');
      if (input.decision === 'reject') {
        await tx.update(receptions).set({ linkState: 'rejected', version: r.version + 1, updatedAt: new Date() }).where(eq(receptions.id, r.id));
        await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId: r.id, kind: 'note', data: { text: `پیشنهاد تصادفی رد شد${input.reason ? `: ${input.reason}` : ''}` }, actorUserId: actor.user.id, isTest: actor.user.isTestTenant });
        await this.audit.record(tx, actor, { entityType: 'reception', entityId: r.id, action: 'reception.accident_rejected', reason: input.reason, before: { linkState: r.linkState }, after: { linkState: 'rejected' } });
        return { receptionId: r.id, linkState: 'rejected', caseId: null };
      }
      const real = await hasRealReceptions(tx, tenantId);
      const [kase] = await tx.select({ id: cases.id, status: cases.status, isDemo: cases.isDemo }).from(cases).where(and(eq(cases.tenantId, tenantId), eq(cases.id, input.caseId)));
      if (!kase || kase.status !== 'open' || (real && kase.isDemo)) throw badRequest('ACCIDENT_CASE_INVALID', 'پروندهٔ تصادفی انتخاب‌شده باز نیست یا پیدا نشد.');
      await tx.update(receptions).set({ caseId: kase.id, linkState: 'linked', version: r.version + 1, updatedAt: new Date() }).where(eq(receptions.id, r.id));
      await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId: r.id, kind: 'case_linked', data: { caseId: kase.id, byExpert: true }, actorUserId: actor.user.id, isTest: actor.user.isTestTenant });
      await this.audit.record(tx, actor, { entityType: 'reception', entityId: r.id, caseId: kase.id, action: 'reception.accident_confirmed', before: { caseId: null, linkState: r.linkState }, after: { caseId: kase.id, linkState: 'linked' } });
      return { receptionId: r.id, linkState: 'linked', caseId: kase.id };
    });
  }
}

