import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  FINANCE_GATE_LABELS,
  type CaseFinance,
  type FinanceApproval,
  type FinanceDecisionInput,
  type FinanceGateReason,
  type FinancePaymentInput,
  type FinanceSharesInput,
  type ProposeFinanceInput,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { assertNotFuture, CasesService } from '../cases/cases.service';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { assessments, caseFinance, cases, financialApprovals, partRequests, users } from '../db/schema';

type ApprovalRow = typeof financialApprovals.$inferSelect;

const proposedByUser = alias(users, 'finance_proposed_by');
const decidedByUser = alias(users, 'finance_decided_by');
const paidByUser = alias(users, 'finance_paid_by');

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// Sources that are bought for the case; stock and customer parts are not purchases.
export const PURCHASE_SOURCES = ['company', 'external', 'insurer_supplier'];

export interface GateResult {
  open: boolean;
  reason: FinanceGateReason;
  exceptionId?: string;
}

interface GateInputs {
  coverageType: string;
  estimateRial: number;
  customerShareRial: number | null;
  paid: { coversEstimateRial: number }[];
  exceptions: { id: string; amountRial: number; spentRial: number }[];
}

/** Customer share used by the gate: recorded value, otherwise derived from the coverage. */
export function customerShareOf(coverageType: string, recorded: number | null | undefined, estimateRial: number) {
  if (recorded !== null && recorded !== undefined) return { value: recorded, derived: false };
  if (coverageType === 'personal') return { value: estimateRial, derived: true };
  if (coverageType === 'golden_card' || coverageType === 'insurance') return { value: 0, derived: true };
  return { value: null, derived: true };
}

/**
 * Purchase gate. Only part purchases are held; documentation, planning, stock
 * reservation and repair work continue. A paid advance covers the estimate it
 * was approved for: a supplement that raises the estimate closes the gate
 * again until a new advance (or an exception) is approved.
 */
export function evaluateGate(g: GateInputs, purchaseRial: number): GateResult {
  const share = customerShareOf(g.coverageType, g.customerShareRial, g.estimateRial);
  if (share.value === null) return { open: false, reason: 'shares_unknown' };
  if (share.value === 0) {
    if (g.coverageType === 'personal' && g.estimateRial === 0) return { open: false, reason: 'no_estimate' };
    return { open: true, reason: 'no_customer_share' };
  }
  const covered = Math.max(0, ...g.paid.map((p) => p.coversEstimateRial));
  if (g.paid.length && covered >= g.estimateRial) return { open: true, reason: 'advance_paid' };
  const exception = g.exceptions.find((e) => e.amountRial - e.spentRial >= purchaseRial);
  if (exception) return { open: true, reason: 'exception', exceptionId: exception.id };
  return { open: false, reason: g.paid.length ? 're_approval_required' : 'advance_missing' };
}

@Injectable()
export class FinanceService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  // ---------------------------------------------------------------- commands

  async setShares(actor: Actor, caseId: string, input: FinanceSharesInput): Promise<CaseFinance> {
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      await this.cases.loadForWrite(tx, tenantId, caseId);
      const [current] = await tx.select().from(caseFinance).where(eq(caseFinance.caseId, caseId));
      const values = {
        customerShareRial: input.customerShareRial,
        insurerShareRial: input.insurerShareRial,
        companyShareRial: input.companyShareRial,
        note: input.note ?? null,
      };
      let row: typeof caseFinance.$inferSelect | undefined;
      if (!current) {
        [row] = await tx
          .insert(caseFinance)
          .values({ caseId, tenantId, ...values, updatedBy: actor.user.id, isTest: actor.user.isTestTenant })
          .returning();
      } else {
        if (input.expectedVersion !== current.version) throw versionConflict(current.version);
        [row] = await tx
          .update(caseFinance)
          .set({ ...values, updatedAt: new Date(), updatedBy: actor.user.id, version: current.version + 1 })
          .where(and(eq(caseFinance.caseId, caseId), eq(caseFinance.version, current.version)))
          .returning();
        if (!row) throw versionConflict();
      }
      await this.audit.record(tx, actor, {
        entityType: 'finance',
        entityId: caseId,
        caseId,
        action: 'finance.shares_set',
        reason: input.note ?? null,
        before: current
          ? {
              customerShareRial: current.customerShareRial,
              insurerShareRial: current.insurerShareRial,
              companyShareRial: current.companyShareRial,
            }
          : null,
        after: {
          customerShareRial: values.customerShareRial,
          insurerShareRial: values.insurerShareRial,
          companyShareRial: values.companyShareRial,
        },
        snapshot: { version: row!.version, row: row! },
      });
    });
    return this.summary(actor, caseId);
  }

  async propose(actor: Actor, caseId: string, input: ProposeFinanceInput): Promise<CaseFinance> {
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      await this.cases.loadForWrite(tx, tenantId, caseId);
      const estimate = await this.estimateOf(tx, tenantId, caseId);
      const open = await tx
        .select({ id: financialApprovals.id })
        .from(financialApprovals)
        .where(
          and(
            eq(financialApprovals.caseId, caseId),
            eq(financialApprovals.kind, input.kind),
            eq(financialApprovals.status, 'proposed'),
          ),
        );
      if (open.length) {
        throw badRequest('FINANCE_PROPOSAL_OPEN', 'یک پیشنهاد مشابه هنوز منتظر تصمیم مدیر است');
      }
      const id = newId();
      const [row] = await tx
        .insert(financialApprovals)
        .values({
          id,
          tenantId,
          caseId,
          kind: input.kind,
          amountRial: input.amountRial,
          coversEstimateRial: estimate,
          reason: input.reason,
          proposedBy: actor.user.id,
          isTest: actor.user.isTestTenant,
        })
        .returning();
      await this.audit.record(tx, actor, {
        entityType: 'finance',
        entityId: id,
        caseId,
        action: 'finance.proposed',
        reason: input.reason,
        after: { kind: input.kind, amountRial: input.amountRial, estimateRial: estimate },
        snapshot: { version: 1, row: row! },
      });
    });
    return this.summary(actor, caseId);
  }

  async decide(actor: Actor, id: string, input: FinanceDecisionInput): Promise<CaseFinance> {
    const a = await this.db.transaction(async (tx) => {
      const a = await this.loadForWrite(tx, actor.user.tenantId, id, input.expectedVersion);
      if (a.status !== 'proposed') throw badRequest('FINANCE_NOT_PROPOSED', 'این پیشنهاد قبلاً تعیین تکلیف شده است');
      // Separation of duties: nobody approves their own proposal.
      if (a.proposedBy === actor.user.id) {
        throw forbidden('پیشنهاددهنده نمی‌تواند پیشنهاد خود را تأیید یا رد کند');
      }
      const status = input.decision === 'approve' ? 'approved' : 'rejected';
      const saved = await this.save(tx, a, {
        status,
        decidedAt: new Date(),
        decidedBy: actor.user.id,
        decisionNote: input.note ?? null,
      });
      await this.audit.record(tx, actor, {
        entityType: 'finance',
        entityId: id,
        caseId: a.caseId,
        action: status === 'approved' ? 'finance.approved' : 'finance.rejected',
        reason: input.note ?? null,
        after: { kind: a.kind, amountRial: a.amountRial, status },
        snapshot: { version: saved.version, row: saved },
      });
      return saved;
    });
    return this.summary(actor, a.caseId);
  }

  async confirmPayment(actor: Actor, id: string, input: FinancePaymentInput): Promise<CaseFinance> {
    const at = input.at ? new Date(input.at) : new Date();
    assertNotFuture(at, 'زمان دریافت نمی‌تواند در آینده باشد');
    const a = await this.db.transaction(async (tx) => {
      const a = await this.loadForWrite(tx, actor.user.tenantId, id, input.expectedVersion);
      if (a.kind !== 'advance') throw badRequest('FINANCE_NOT_ADVANCE', 'فقط دریافت پیش‌پرداخت ثبت می‌شود');
      if (a.status !== 'approved') {
        throw badRequest('FINANCE_NOT_APPROVED', 'دریافت فقط برای پیش‌پرداخت تأییدشده توسط مدیر ثبت می‌شود');
      }
      if (a.proposedBy === actor.user.id) throw forbidden('پیشنهاددهنده نمی‌تواند دریافت را تأیید کند');
      const saved = await this.save(tx, a, {
        status: 'paid',
        paidAt: at,
        paymentRef: input.paymentRef,
        paymentConfirmedBy: actor.user.id,
      });
      await this.audit.record(tx, actor, {
        entityType: 'finance',
        entityId: id,
        caseId: a.caseId,
        action: 'finance.paid',
        occurredAt: at,
        after: { amountRial: a.amountRial, paymentRef: input.paymentRef },
        snapshot: { version: saved.version, row: saved },
      });
      return saved;
    });
    return this.summary(actor, a.caseId);
  }

  // ------------------------------------------------------------------- gate

  /** Purchase gate for a case, evaluated inside the caller's transaction. */
  async gate(tx: DbOrTx, tenantId: string, caseId: string, purchaseRial: number): Promise<GateResult> {
    return evaluateGate(await this.gateInputs(tx, tenantId, caseId), purchaseRial);
  }

  private async gateInputs(db: DbOrTx, tenantId: string, caseId: string): Promise<GateInputs> {
    const [kase] = await db
      .select({ coverageType: cases.coverageType })
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));
    if (!kase) throw notFound('پرونده');
    const [shares] = await db.select().from(caseFinance).where(eq(caseFinance.caseId, caseId));
    const approvals = await db
      .select()
      .from(financialApprovals)
      .where(and(eq(financialApprovals.caseId, caseId), inArray(financialApprovals.status, ['approved', 'paid'])));
    const spent = await this.spentByException(
      db,
      approvals.filter((a) => a.kind === 'exception').map((a) => a.id),
    );
    return {
      coverageType: kase.coverageType,
      estimateRial: await this.estimateOf(db, tenantId, caseId),
      customerShareRial: shares?.customerShareRial ?? null,
      paid: approvals.filter((a) => a.kind === 'advance' && a.status === 'paid'),
      exceptions: approvals
        .filter((a) => a.kind === 'exception' && a.status === 'approved')
        .map((a) => ({ id: a.id, amountRial: a.amountRial, spentRial: spent.get(a.id) ?? 0 })),
    };
  }

  /** Approved amount of the current final assessment version (total while authorization is pending). */
  async estimateOf(db: DbOrTx, tenantId: string, caseId: string): Promise<number> {
    const [a] = await db
      .select({ parts: assessments.partsRial, labour: assessments.labourRial, approved: assessments.approvedRial })
      .from(assessments)
      .where(and(eq(assessments.tenantId, tenantId), eq(assessments.caseId, caseId), eq(assessments.status, 'final')))
      .orderBy(desc(assessments.versionNo))
      .limit(1);
    return a ? (a.approved ?? a.parts + a.labour) : 0;
  }

  private async spentByException(db: DbOrTx, ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await db
      .select({
        id: partRequests.financeExceptionId,
        spent: sql<number>`coalesce(sum(${partRequests.quantity} * ${partRequests.unitPriceRial}), 0)::bigint`,
      })
      .from(partRequests)
      .where(and(inArray(partRequests.financeExceptionId, ids), ne(partRequests.status, 'cancelled')))
      .groupBy(partRequests.financeExceptionId);
    return new Map(rows.map((r) => [r.id!, Number(r.spent)]));
  }

  // ----------------------------------------------------------------- queries

  async summary(actor: Actor, caseId: string): Promise<CaseFinance> {
    const tenantId = actor.user.tenantId;
    const [kase] = await this.db
      .select({ coverageType: cases.coverageType })
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));
    if (!kase) throw notFound('پرونده');
    const inputs = await this.gateInputs(this.db, tenantId, caseId);
    const gate = evaluateGate(inputs, 0);
    const [shares] = await this.db.select().from(caseFinance).where(eq(caseFinance.caseId, caseId));
    const share = customerShareOf(kase.coverageType, shares?.customerShareRial, inputs.estimateRial);

    const rows = await this.db
      .select({
        a: financialApprovals,
        proposedByName: proposedByUser.displayName,
        decidedByName: decidedByUser.displayName,
        paidByName: paidByUser.displayName,
      })
      .from(financialApprovals)
      .innerJoin(proposedByUser, eq(proposedByUser.id, financialApprovals.proposedBy))
      .leftJoin(decidedByUser, eq(decidedByUser.id, financialApprovals.decidedBy))
      .leftJoin(paidByUser, eq(paidByUser.id, financialApprovals.paymentConfirmedBy))
      .where(and(eq(financialApprovals.tenantId, tenantId), eq(financialApprovals.caseId, caseId)))
      .orderBy(asc(financialApprovals.proposedAt));
    const spent = await this.spentByException(
      this.db,
      rows.filter((r) => r.a.kind === 'exception').map((r) => r.a.id),
    );
    const approvals: FinanceApproval[] = rows.map(({ a, proposedByName, decidedByName, paidByName }) => ({
      id: a.id,
      kind: a.kind as FinanceApproval['kind'],
      status: a.status as FinanceApproval['status'],
      amountRial: a.amountRial,
      coversEstimateRial: a.coversEstimateRial,
      spentRial: spent.get(a.id) ?? 0,
      reason: a.reason,
      proposedAt: a.proposedAt.toISOString(),
      proposedBy: { id: a.proposedBy, displayName: proposedByName },
      decidedAt: iso(a.decidedAt),
      decidedBy: a.decidedBy ? { id: a.decidedBy, displayName: decidedByName! } : null,
      decisionNote: a.decisionNote,
      paidAt: iso(a.paidAt),
      paymentRef: a.paymentRef,
      paymentConfirmedBy: a.paymentConfirmedBy ? { id: a.paymentConfirmedBy, displayName: paidByName! } : null,
      version: a.version,
    }));
    const paidRial = approvals.filter((a) => a.status === 'paid').reduce((s, a) => s + a.amountRial, 0);

    const [purchases] = await this.db
      .select({ total: sql<number>`coalesce(sum(${partRequests.quantity} * ${partRequests.unitPriceRial}), 0)::bigint` })
      .from(partRequests)
      .where(
        and(
          eq(partRequests.caseId, caseId),
          inArray(partRequests.source, PURCHASE_SOURCES),
          notInArray(partRequests.status, ['needed', 'cancelled']),
        ),
      );

    return {
      caseId,
      estimateRial: inputs.estimateRial,
      shares: {
        customerShareRial: shares?.customerShareRial ?? null,
        insurerShareRial: shares?.insurerShareRial ?? null,
        companyShareRial: shares?.companyShareRial ?? null,
        note: shares?.note ?? null,
        version: shares?.version ?? null,
      },
      customerShareRial: share.value,
      customerShareDerived: share.derived,
      paidRial,
      balanceRial: share.value === null ? null : Math.max(0, share.value - paidRial),
      purchasesRial: Number(purchases?.total ?? 0),
      gate: { open: gate.open, reason: gate.reason, message: FINANCE_GATE_LABELS[gate.reason] },
      approvals,
    };
  }

  // ---------------------------------------------------------------- helpers

  private async loadForWrite(tx: DbOrTx, tenantId: string, id: string, expectedVersion: number) {
    const [a] = await tx
      .select()
      .from(financialApprovals)
      .where(and(eq(financialApprovals.id, id), eq(financialApprovals.tenantId, tenantId)));
    if (!a) throw notFound('پیشنهاد مالی');
    if (a.version !== expectedVersion) throw versionConflict(a.version);
    await this.cases.loadForWrite(tx, tenantId, a.caseId);
    return a;
  }

  private async save(tx: DbOrTx, a: ApprovalRow, patch: Partial<ApprovalRow>): Promise<ApprovalRow> {
    const [row] = await tx
      .update(financialApprovals)
      .set({ ...patch, updatedAt: new Date(), version: a.version + 1 })
      .where(and(eq(financialApprovals.id, a.id), eq(financialApprovals.version, a.version)))
      .returning();
    if (!row) throw versionConflict();
    return row;
  }
}
