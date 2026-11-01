import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  FINANCE_GATE_LABELS,
  PART_SOURCE_LABELS,
  PART_SOURCES,
  toLatinDigits,
  type CreatePartInput,
  type ImportPartsInput,
  type Part,
  type PartActionInput,
  type PartImportResult,
  type PartImportRow,
  type PartSource,
  type PartsFromAssessmentInput,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { BlockersService } from '../blockers/blockers.service';
import { assertNotFuture, CasesService, MINUTE_TOLERANCE_MS } from '../cases/cases.service';
import { badRequest, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { assessmentItems, assessments, blockers, departments, partRequests, users } from '../db/schema';
import { FinanceService, PURCHASE_SOURCES } from '../finance/finance.service';
import { readFirstSheet, XlsxError } from './xlsx';

type PartRow = typeof partRequests.$inferSelect;

const createdByUser = alias(users, 'part_created_by');
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// Column headers of the import sheet (first row). Matching ignores spaces.
export const IMPORT_COLUMNS = {
  description: 'شرح قطعه',
  partNumber: 'شماره فنی',
  quantity: 'تعداد',
  source: 'منبع',
  approvedUnitPriceRial: 'قیمت تأییدشده واحد (ریال)',
  notes: 'توضیح',
} as const;

// Source accepted as code or Persian label (with or without the parenthesis).
const SOURCE_ALIASES = new Map<string, PartSource>(
  PART_SOURCES.flatMap((s) => [
    [s, s],
    [PART_SOURCE_LABELS[s], s],
    [PART_SOURCE_LABELS[s].replace(/\s*\(.*\)$/, ''), s],
  ]),
);
const squash = (s: string) => s.replace(/[\s‌]+/g, '');
const numberOf = (s: string) => (s === '' ? NaN : Number(toLatinDigits(s).replace(/[,٬\s]/g, '')));

const invalidTransition = (status: string) =>
  badRequest('INVALID_TRANSITION', `این اقدام در وضعیت فعلی قطعه (${status}) ممکن نیست`);

/**
 * Parts lifecycle. Ordering is the controlled step: the assessment line must
 * be authorized, a price above the approved one needs the assessor's approval
 * reference, and purchases pass the financial gate. Handover to the repair
 * unit resolves "part not arrived" blockers that name the part.
 */
@Injectable()
export class PartsService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
    private readonly blockers: BlockersService,
    private readonly finance: FinanceService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  async create(actor: Actor, caseId: string, input: CreatePartInput): Promise<Part> {
    const id = await this.db.transaction(async (tx) => {
      await this.loadOpenCase(tx, actor.user.tenantId, caseId);
      return (await this.insert(tx, actor, caseId, { ...input, assessmentItemId: null }, null)).id;
    });
    return this.get(actor, id);
  }

  /** Creates needs for authorized "replace" lines of the current assessment not requested yet. */
  async fromAssessment(actor: Actor, caseId: string, input: PartsFromAssessmentInput): Promise<Part[]> {
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      await this.loadOpenCase(tx, tenantId, caseId);
      const lines = await this.authorizedLines(tx, tenantId, caseId);
      if (!lines) throw badRequest('NO_FINAL_ASSESSMENT', 'کارشناسی نهایی برای این پرونده ثبت نشده است');
      const existing = await tx
        .select({ root: partRequests.assessmentItemId })
        .from(partRequests)
        .where(and(eq(partRequests.caseId, caseId), ne(partRequests.status, 'cancelled')));
      const requested = new Set(existing.map((e) => e.root));
      const todo = lines.filter((l) => l.item.action === 'replace' && l.approved && !requested.has(l.root));
      if (!todo.length) {
        throw badRequest('NOTHING_TO_REQUEST', 'قلم تعویضیِ مجوزدار و ثبت‌نشده‌ای در کارشناسی فعلی وجود ندارد');
      }
      for (const { item, root } of todo) {
        await this.insert(
          tx,
          actor,
          caseId,
          {
            description: item.description,
            partNumber: item.partNumber,
            quantity: item.quantity,
            source: input.source ?? 'company',
            approvedUnitPriceRial: item.unitPriceRial,
            notes: null,
            assessmentItemId: root,
          },
          'از کارشناسی',
        );
      }
    });
    return this.list(actor, caseId);
  }

  async importSheet(actor: Actor, caseId: string, input: ImportPartsInput): Promise<PartImportResult> {
    const { rows, errors } = parseImport(Buffer.from(input.fileBase64, 'base64'));
    if (input.dryRun || errors.length) {
      // A file with errors is never imported partly.
      if (!input.dryRun) throw badRequest('IMPORT_INVALID', 'فایل خطا دارد و هیچ ردیفی وارد نشد', errors);
      await this.cases.detail(actor, caseId);
      return { dryRun: true, rows, errors, created: 0 };
    }
    await this.db.transaction(async (tx) => {
      await this.loadOpenCase(tx, actor.user.tenantId, caseId);
      for (const r of rows) {
        await this.insert(tx, actor, caseId, { ...r, assessmentItemId: null }, `ورود از اکسل، ردیف ${r.row}`);
      }
    });
    return { dryRun: false, rows, errors: [], created: rows.length };
  }

  async act(actor: Actor, id: string, input: PartActionInput): Promise<Part> {
    const tenantId = actor.user.tenantId;
    const at = input.at ? new Date(input.at) : new Date();
    assertNotFuture(at, 'زمان ثبت‌شده نمی‌تواند در آینده باشد');
    await this.db.transaction(async (tx) => {
      const p = await this.loadForWrite(tx, tenantId, id, input.expectedVersion);
      let patch: Partial<PartRow> = {};
      let action = `part.${input.action}`;
      let before: Record<string, unknown> | null = null;

      switch (input.action) {
        case 'check_stock':
          if (p.status !== 'needed') throw invalidTransition(p.status);
          patch = { inStock: input.inStock!, stockCheckedAt: at };
          action = 'part.stock_checked';
          break;
        case 'reserve':
          if (p.status !== 'needed') throw invalidTransition(p.status);
          if (p.inStock !== true) {
            throw badRequest('NOT_IN_STOCK', 'رزرو فقط پس از ثبت موجودی در انبار ممکن است');
          }
          patch = { status: 'reserved', source: 'stock', reservedAt: at };
          action = 'part.reserved';
          break;
        case 'order':
          patch = await this.orderPatch(tx, tenantId, p, input, at);
          action = 'part.ordered';
          break;
        case 'update_eta':
          if (p.status !== 'ordered') throw invalidTransition(p.status);
          before = { etaAt: iso(p.etaAt) };
          patch = { etaAt: new Date(input.etaAt!) };
          action = 'part.eta_changed';
          break;
        case 'receive':
          if (p.status !== 'ordered') throw invalidTransition(p.status);
          if (p.orderedAt && at.getTime() < p.orderedAt.getTime() - MINUTE_TOLERANCE_MS) {
            throw badRequest('INVALID_TIME', 'زمان رسید نمی‌تواند قبل از سفارش باشد');
          }
          patch = {
            status: input.inspection === 'ok' ? 'received' : 'rejected',
            receivedAt: at,
            receiptDocNo: input.receiptDocNo ?? null,
            inspection: input.inspection!,
            inspectionNote: input.note ?? null,
          };
          action = input.inspection === 'ok' ? 'part.received' : 'part.rejected';
          break;
        case 'hand_over':
          if (p.status !== 'received' && p.status !== 'reserved') throw invalidTransition(p.status);
          if (input.departmentId) await this.assertDepartment(tx, tenantId, input.departmentId);
          patch = {
            status: 'handed_over',
            handedOverAt: at,
            handedOverDepartmentId: input.departmentId ?? null,
            recipientName: input.recipientName!,
          };
          action = 'part.handed_over';
          break;
        case 'cancel':
          if (p.status === 'handed_over' || p.status === 'cancelled') throw invalidTransition(p.status);
          patch = { status: 'cancelled', cancelledAt: at, cancelReason: input.note! };
          action = 'part.cancelled';
          break;
      }

      const saved = await this.save(tx, p, patch);
      const after: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) after[k] = v instanceof Date ? v.toISOString() : v;
      await this.audit.record(tx, actor, {
        entityType: 'part',
        entityId: p.id,
        caseId: p.caseId,
        action,
        reason: input.note ?? null,
        occurredAt: at,
        before: before ?? { status: p.status },
        after: { description: p.description, ...after },
        snapshot: { version: saved.version, row: saved },
      });

      if (input.action === 'hand_over') {
        const waiting = await tx
          .select()
          .from(blockers)
          .where(and(eq(blockers.partRequestId, p.id), isNull(blockers.resolvedAt)));
        for (const b of waiting) {
          await this.blockers.closeAndRelease(tx, actor, b, at, `تحویل قطعه «${p.description}» به واحد تعمیر`);
        }
      }
    });
    return this.get(actor, id);
  }

  // ----------------------------------------------------------------- queries

  async list(actor: Actor, caseId: string): Promise<Part[]> {
    await this.cases.detail(actor, caseId); // tenant check + 404
    return this.load(actor.user.tenantId, eq(partRequests.caseId, caseId));
  }

  async get(actor: Actor, id: string): Promise<Part> {
    const [p] = await this.load(actor.user.tenantId, eq(partRequests.id, id));
    if (!p) throw notFound('قطعه');
    return p;
  }

  private async load(tenantId: string, where: ReturnType<typeof eq>): Promise<Part[]> {
    const rows = await this.db
      .select({ p: partRequests, d: departments, createdByName: createdByUser.displayName })
      .from(partRequests)
      .innerJoin(createdByUser, eq(createdByUser.id, partRequests.createdBy))
      .leftJoin(departments, eq(departments.id, partRequests.handedOverDepartmentId))
      .where(and(eq(partRequests.tenantId, tenantId), where))
      .orderBy(asc(partRequests.createdAt), asc(partRequests.id));
    const now = Date.now();
    return rows.map(({ p, d, createdByName }) => ({
      id: p.id,
      caseId: p.caseId,
      assessmentItemId: p.assessmentItemId,
      description: p.description,
      partNumber: p.partNumber,
      quantity: p.quantity,
      source: p.source as Part['source'],
      status: p.status as Part['status'],
      inStock: p.inStock,
      stockCheckedAt: iso(p.stockCheckedAt),
      reservedAt: iso(p.reservedAt),
      approvedUnitPriceRial: p.approvedUnitPriceRial,
      unitPriceRial: p.unitPriceRial,
      priceApprovalRef: p.priceApprovalRef,
      priceApprovedBy: p.priceApprovedBy,
      supplier: p.supplier,
      orderRef: p.orderRef,
      orderedAt: iso(p.orderedAt),
      etaAt: iso(p.etaAt),
      firstEtaAt: iso(p.firstEtaAt),
      receivedAt: iso(p.receivedAt),
      receiptDocNo: p.receiptDocNo,
      inspection: p.inspection as Part['inspection'],
      inspectionNote: p.inspectionNote,
      handedOverAt: iso(p.handedOverAt),
      handedOverDepartment: d ? { id: d.id, name: d.name } : null,
      recipientName: p.recipientName,
      cancelledAt: iso(p.cancelledAt),
      cancelReason: p.cancelReason,
      financeBasis: p.financeBasis as Part['financeBasis'],
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
      createdBy: { id: p.createdBy, displayName: createdByName },
      overdue: p.status === 'ordered' && !!p.etaAt && p.etaAt.getTime() < now,
      version: p.version,
    }));
  }

  // ---------------------------------------------------------------- helpers

  private async orderPatch(
    tx: DbOrTx,
    tenantId: string,
    p: PartRow,
    input: PartActionInput,
    at: Date,
  ): Promise<Partial<PartRow>> {
    if (p.status !== 'needed' && p.status !== 'rejected') throw invalidTransition(p.status);
    const source = input.source ?? (p.source as PartSource);
    if (source === 'stock') throw badRequest('USE_RESERVE', 'قطعه انبار با «رزرو» ثبت می‌شود، نه سفارش');

    // Authorization: a line from the assessment is ordered only once approved.
    if (p.assessmentItemId) {
      const lines = (await this.authorizedLines(tx, tenantId, p.caseId)) ?? [];
      const line = lines.find((l) => l.root === p.assessmentItemId);
      if (!line?.approved) {
        throw badRequest('AUTHORIZATION_REQUIRED', 'سفارش این قطعه پیش از ثبت مجوز قلم کارشناسی ممکن نیست');
      }
    }

    const etaAt = input.etaAt ? new Date(input.etaAt) : null;
    const common = {
      status: 'ordered',
      source,
      supplier: input.supplier ?? null,
      orderRef: input.orderRef ?? null,
      orderedAt: at,
      etaAt,
      firstEtaAt: p.firstEtaAt ?? etaAt,
      // A re-order after a wrong/defective part starts a fresh receipt.
      receivedAt: null,
      inspection: null,
      inspectionNote: null,
      receiptDocNo: null,
    } satisfies Partial<PartRow>;

    if (!PURCHASE_SOURCES.includes(source)) {
      // Customer-supplied part: nothing is bought.
      return { ...common, unitPriceRial: null, financeBasis: 'not_purchase', financeExceptionId: null };
    }
    if (input.unitPriceRial === undefined) {
      throw badRequest('PRICE_REQUIRED', 'برای سفارش خرید، قیمت واحد قطعه را وارد کنید');
    }
    const unitPrice = input.unitPriceRial;
    const aboveApproved = p.approvedUnitPriceRial !== null && unitPrice > p.approvedUnitPriceRial;
    if (aboveApproved && (!input.priceApprovalRef || !input.priceApprovedBy)) {
      throw badRequest(
        'PRICE_ABOVE_APPROVED',
        'قیمت از مبلغ تأییدشده بیشتر است؛ نام کارشناس تأییدکننده و شماره تأیید را ثبت کنید یا الحاقیه بزنید',
        { approvedUnitPriceRial: p.approvedUnitPriceRial, unitPriceRial: unitPrice },
      );
    }
    const gate = await this.finance.gate(tx, tenantId, p.caseId, unitPrice * p.quantity);
    if (!gate.open) {
      throw badRequest('FINANCE_GATE', FINANCE_GATE_LABELS[gate.reason], { reason: gate.reason });
    }
    return {
      ...common,
      unitPriceRial: unitPrice,
      priceApprovalRef: aboveApproved ? input.priceApprovalRef! : null,
      priceApprovedBy: aboveApproved ? input.priceApprovedBy! : null,
      financeBasis: gate.reason,
      financeExceptionId: gate.exceptionId ?? null,
    };
  }

  /**
   * Lines of the current final assessment with their root line id (first
   * version) and whether they are authorized; null without a final version.
   */
  async authorizedLines(tx: DbOrTx, tenantId: string, caseId: string) {
    const versions = await tx
      .select({ id: assessments.id, status: assessments.status })
      .from(assessments)
      .where(and(eq(assessments.tenantId, tenantId), eq(assessments.caseId, caseId)))
      .orderBy(desc(assessments.versionNo));
    const current = versions.find((v) => v.status === 'final');
    if (!current) return null;
    const all = await tx
      .select()
      .from(assessmentItems)
      .where(
        inArray(
          assessmentItems.assessmentId,
          versions.map((v) => v.id),
        ),
      );
    const byId = new Map(all.map((i) => [i.id, i]));
    const rootOf = (id: string): string => {
      let item = byId.get(id);
      while (item?.originItemId && byId.has(item.originItemId)) item = byId.get(item.originItemId);
      return item?.id ?? id;
    };
    return all
      .filter((i) => i.assessmentId === current.id)
      .map((item) => ({ item, root: rootOf(item.id), approved: item.approvalStatus === 'approved' }));
  }

  private async insert(
    tx: DbOrTx,
    actor: Actor,
    caseId: string,
    input: Omit<CreatePartInput, 'quantity'> & { quantity?: number; assessmentItemId: string | null },
    reason: string | null,
  ): Promise<PartRow> {
    const id = newId();
    const [row] = await tx
      .insert(partRequests)
      .values({
        id,
        tenantId: actor.user.tenantId,
        caseId,
        assessmentItemId: input.assessmentItemId,
        description: input.description,
        partNumber: input.partNumber ?? null,
        quantity: input.quantity ?? 1,
        source: input.source,
        approvedUnitPriceRial: input.approvedUnitPriceRial ?? null,
        notes: input.notes ?? null,
        createdBy: actor.user.id,
        isTest: actor.user.isTestTenant,
      })
      .returning();
    await this.audit.record(tx, actor, {
      entityType: 'part',
      entityId: id,
      caseId,
      action: 'part.created',
      reason,
      after: { description: row!.description, quantity: row!.quantity, source: row!.source },
      snapshot: { version: 1, row: row! },
    });
    return row!;
  }

  private async loadOpenCase(tx: DbOrTx, tenantId: string, caseId: string) {
    const kase = await this.cases.loadForWrite(tx, tenantId, caseId);
    if (kase.stage === 'delivered') throw badRequest('CASE_DELIVERED', 'پرونده تحویل شده است');
    return kase;
  }

  private async loadForWrite(tx: DbOrTx, tenantId: string, id: string, expectedVersion: number): Promise<PartRow> {
    const [p] = await tx
      .select()
      .from(partRequests)
      .where(and(eq(partRequests.id, id), eq(partRequests.tenantId, tenantId)));
    if (!p) throw notFound('قطعه');
    if (p.version !== expectedVersion) throw versionConflict(p.version);
    await this.cases.loadForWrite(tx, tenantId, p.caseId);
    return p;
  }

  private async save(tx: DbOrTx, p: PartRow, patch: Partial<PartRow>): Promise<PartRow> {
    const [row] = await tx
      .update(partRequests)
      .set({ ...patch, updatedAt: new Date(), version: p.version + 1 })
      .where(and(eq(partRequests.id, p.id), eq(partRequests.version, p.version)))
      .returning();
    if (!row) throw versionConflict();
    return row;
  }

  private async assertDepartment(tx: DbOrTx, tenantId: string, departmentId: string) {
    const [d] = await tx
      .select({ isActive: departments.isActive })
      .from(departments)
      .where(and(eq(departments.id, departmentId), eq(departments.tenantId, tenantId)));
    if (!d || !d.isActive) throw badRequest('INVALID_DEPARTMENT', 'واحد انتخاب‌شده معتبر نیست');
  }
}

/** Validates the import sheet; every row is checked so the user sees all errors at once. */
export function parseImport(data: Uint8Array): { rows: PartImportRow[]; errors: { row: number; message: string }[] } {
  let grid: string[][];
  try {
    grid = readFirstSheet(data);
  } catch (err) {
    const message = err instanceof XlsxError ? err.message : 'فایل اکسل خوانده نشد';
    return { rows: [], errors: [{ row: 0, message }] };
  }
  const header = (grid[0] ?? []).map(squash);
  const col = Object.fromEntries(
    Object.entries(IMPORT_COLUMNS).map(([key, title]) => [key, header.indexOf(squash(title))]),
  ) as Record<keyof typeof IMPORT_COLUMNS, number>;
  if (col.description < 0 || col.source < 0) {
    return {
      rows: [],
      errors: [{ row: 1, message: `ستون‌های «${IMPORT_COLUMNS.description}» و «${IMPORT_COLUMNS.source}» در ردیف اول لازم است` }],
    };
  }

  const rows: PartImportRow[] = [];
  const errors: { row: number; message: string }[] = [];
  const cell = (r: string[], key: keyof typeof IMPORT_COLUMNS) => (col[key] >= 0 ? (r[col[key]] ?? '').trim() : '');
  grid.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    if (!r.some((v) => v)) return;
    const problems: string[] = [];
    const description = cell(r, 'description');
    if (!description) problems.push('شرح قطعه خالی است');
    if (description.length > 300) problems.push('شرح قطعه بیش از ۳۰۰ نویسه است');
    const source = SOURCE_ALIASES.get(cell(r, 'source')) ?? SOURCE_ALIASES.get(cell(r, 'source').toLowerCase());
    if (!source) problems.push(`منبع «${cell(r, 'source')}» شناخته نشد`);
    const qtyText = cell(r, 'quantity');
    const quantity = qtyText ? numberOf(qtyText) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) problems.push('تعداد باید عدد صحیح ۱ تا ۹۹۹ باشد');
    const priceText = cell(r, 'approvedUnitPriceRial');
    const price = priceText ? numberOf(priceText) : null;
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 1_000_000_000_000)) {
      problems.push('قیمت باید عدد صحیح ریالی باشد');
    }
    if (problems.length) {
      errors.push({ row: rowNo, message: problems.join('؛ ') });
      return;
    }
    rows.push({
      row: rowNo,
      description,
      partNumber: cell(r, 'partNumber') || null,
      quantity,
      source: source!,
      approvedUnitPriceRial: price,
      notes: cell(r, 'notes') || null,
    });
  });
  if (!rows.length && !errors.length) errors.push({ row: 2, message: 'ردیفی برای ورود پیدا نشد' });
  return { rows, errors };
}
