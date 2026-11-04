import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  toPersianDigits,
  type ImportAssessmentInput,
  type AssessmentImportPreview,
  type Assessment,
  type AssessmentItem,
  type AssessmentItemInput,
  type AssessmentTotals,
  type AuthorizationStatus,
  type CreateAssessmentInput,
  type FinalizeAssessmentInput,
  type RecordAuthorizationInput,
  type RemoveAssessmentItemInput,
  type UpdateAssessmentItemInput,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { BlockersService } from '../blockers/blockers.service';
import { assertNotFuture, CasesService, MINUTE_TOLERANCE_MS } from '../cases/cases.service';
import { badRequest, conflict, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { assessmentItems, assessments, blockers, departments, users } from '../db/schema';
import { parseAssessmentSheet } from './assessment-sheet';

type AssessmentRow = typeof assessments.$inferSelect;
type ItemRow = typeof assessmentItems.$inferSelect;

// Stages before the vehicle waits for authorization; finalizing the initial
// assessment moves such a case to "awaiting approval".
const PRE_APPROVAL_STAGES = ['reception', 'assessment'];

const createdByUser = alias(users, 'assessment_created_by');
const finalizedByUser = alias(users, 'assessment_finalized_by');
const authRecordedByUser = alias(users, 'assessment_auth_recorded_by');

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function totalsOf(items: Pick<ItemRow, 'quantity' | 'unitPriceRial' | 'labourRial' | 'approvalStatus'>[]) {
  let partsRial = 0;
  let labourRial = 0;
  let rejectedRial = 0;
  for (const i of items) {
    const line = i.quantity * i.unitPriceRial + i.labourRial;
    partsRial += i.quantity * i.unitPriceRial;
    labourRial += i.labourRial;
    if (i.approvalStatus === 'rejected') rejectedRial += line;
  }
  const totalRial = partsRial + labourRial;
  return { partsRial, labourRial, totalRial, approvedRial: totalRial - rejectedRial };
}

/**
 * Versioned assessments. Version 1 is the initial assessment; hidden damage
 * found later creates a supplement (الحاقیه): a new draft that copies the
 * previous items, so the previous version stays exactly as it was approved.
 * A final version waiting for authorization holds an "authorization" blocker
 * on the case; only recording the external decision resolves it.
 */
@Injectable()
export class AssessmentsService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly cases: CasesService,
    private readonly blockers: BlockersService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  async create(actor: Actor, caseId: string, input: CreateAssessmentInput): Promise<Assessment> {
    const tenantId = actor.user.tenantId;
    const assessedAt = input.assessedAt ? new Date(input.assessedAt) : new Date();
    assertNotFuture(assessedAt, 'زمان کارشناسی نمی‌تواند در آینده باشد');
    const discoveredAt = input.discoveredAt ? new Date(input.discoveredAt) : null;
    assertNotFuture(discoveredAt, 'زمان کشف آسیب نمی‌تواند در آینده باشد');
    const id = newId();

    await this.db.transaction(async (tx) => {
      const kase = await this.cases.loadForWrite(tx, tenantId, caseId);
      if (kase.stage === 'delivered') throw badRequest('CASE_DELIVERED', 'پرونده تحویل شده است');
      const versions = await this.versionsOf(tx, tenantId, caseId);
      if (versions.some((v) => v.status === 'draft')) {
        throw conflict('ASSESSMENT_DRAFT_EXISTS', 'یک پیش‌نویس کارشناسی باز برای این پرونده وجود دارد');
      }
      const latest = versions.at(-1);
      if (input.kind === 'initial' && latest) {
        throw badRequest('ASSESSMENT_EXISTS', 'کارشناسی اولیه قبلاً ثبت شده است؛ برای آسیب پنهان الحاقیه ثبت کنید');
      }
      if (input.kind === 'supplement' && !latest) {
        throw badRequest('NO_FINAL_ASSESSMENT', 'الحاقیه فقط پس از نهایی‌شدن کارشناسی اولیه ممکن است');
      }

      const [row] = await tx
        .insert(assessments)
        .values({
          id,
          tenantId,
          caseId,
          versionNo: (latest?.versionNo ?? 0) + 1,
          kind: input.kind,
          previousId: latest?.id ?? null,
          assessorName: input.assessorName,
          assessorOrg: input.assessorOrg ?? null,
          assessedAt,
          reason: input.reason ?? null,
          discoveredAt: input.kind === 'supplement' ? (discoveredAt ?? assessedAt) : null,
          notes: input.notes ?? null,
          createdBy: actor.user.id,
          isTest: actor.user.isTestTenant,
        })
        .returning();

      // The supplement starts as a copy of the previous version; its lines are
      // edited here while the previous version stays untouched.
      if (latest) {
        const items = await tx
          .select()
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, latest.id))
          .orderBy(asc(assessmentItems.lineNo));
        if (items.length) {
          await tx.insert(assessmentItems).values(
            items.map((i) => ({
              ...i,
              id: newId(),
              assessmentId: id,
              originItemId: i.id,
              changed: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          );
        }
      }

      await this.audit.record(tx, actor, {
        entityType: 'assessment',
        entityId: id,
        caseId,
        action: input.kind === 'supplement' ? 'assessment.supplement_created' : 'assessment.created',
        reason: input.reason ?? null,
        after: {
          versionNo: row!.versionNo,
          assessorName: row!.assessorName,
          discoveredAt: iso(row!.discoveredAt),
        },
        snapshot: { version: 1, row: row! },
      });

      if (input.kind === 'initial' && kase.stage === 'reception') {
        await this.cases.applyStage(tx, actor, kase, { stage: 'assessment' }, 'خودکار: شروع کارشناسی');
      }
    });
    return this.get(actor, id);
  }

  async importSheet(actor: Actor, assessmentId: string, input: ImportAssessmentInput): Promise<AssessmentImportPreview> {
    const result = parseAssessmentSheet(Buffer.from(input.fileBase64, 'base64'), input.currency);
    await this.db.transaction(async tx => {
      const tenantId = actor.user.tenantId;
      const a = await this.loadDraft(tx, tenantId, assessmentId, input.expectedVersion);
      const previous = await tx.select().from(assessmentItems).where(and(eq(assessmentItems.tenantId, tenantId), eq(assessmentItems.assessmentId, a.id)));
      for (const row of result.rows) {
        if (previous.some(p => p.action === row.action && p.description === row.description && p.partNumber === row.partNumber)) {
          result.errors.push({ sheet: row.sheet, row: row.row, message: 'این قلم قبلاً در پیش‌نویس وجود دارد؛ برای اصلاح آن از ویرایش استفاده کنید' });
        }
      }
      if (input.dryRun) return;
      if (result.errors.length || !result.rows.length) throw badRequest('ASSESSMENT_IMPORT_INVALID', 'فایل خطا دارد؛ هیچ قلمی وارد نشد. پیش‌نمایش را دوباره بررسی کنید');
      const offset = Math.max(0, ...previous.map(p => p.lineNo));
      const items = result.rows.map((r, index) => ({
        id: newId(), tenantId, assessmentId: a.id, lineNo: offset + index + 1,
        action: r.action, description: r.description, partNumber: r.partNumber,
        quantity: r.quantity, unitPriceRial: r.unitPriceRial, labourRial: r.labourRial,
        evidence: r.evidence, isTest: actor.user.isTestTenant,
      }));
      await tx.insert(assessmentItems).values(items);
      const saved = await this.touch(tx, a);
      await this.audit.record(tx, actor, {
        entityType: 'assessment', entityId: a.id, caseId: a.caseId,
        action: 'assessment.items_imported',
        after: { currency: input.currency, items, skipped: result.skipped.length },
        snapshot: { version: saved.version, row: saved },
      });
      result.applied = true;
    });
    return result;
  }

  async addItem(actor: Actor, assessmentId: string, input: AssessmentItemInput): Promise<Assessment> {
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      const a = await this.loadDraft(tx, tenantId, assessmentId, input.expectedVersion);
      if (input.labourDepartmentId) await this.assertDepartment(tx, tenantId, input.labourDepartmentId);
      const existing = await tx
        .select({ lineNo: assessmentItems.lineNo })
        .from(assessmentItems)
        .where(eq(assessmentItems.assessmentId, a.id));
      const lineNo = Math.max(0, ...existing.map((x) => x.lineNo)) + 1;
      const id = newId();
      await tx.insert(assessmentItems).values({
        id,
        tenantId,
        assessmentId: a.id,
        lineNo,
        action: input.action,
        description: input.description,
        partNumber: input.partNumber ?? null,
        quantity: input.quantity,
        unitPriceRial: input.unitPriceRial,
        labourDepartmentId: input.labourDepartmentId ?? null,
        labourRial: input.labourRial,
        evidence: input.evidence ?? null,
        isTest: actor.user.isTestTenant,
      });
      const saved = await this.touch(tx, a);
      await this.audit.record(tx, actor, {
        entityType: 'assessment',
        entityId: a.id,
        caseId: a.caseId,
        action: 'assessment.item_added',
        after: {
          itemId: id,
          lineNo,
          action: input.action,
          description: input.description,
          quantity: input.quantity,
          unitPriceRial: input.unitPriceRial,
          labourRial: input.labourRial,
        },
        snapshot: { version: saved.version, row: saved },
      });
    });
    return this.get(actor, assessmentId);
  }

  async updateItem(actor: Actor, itemId: string, input: UpdateAssessmentItemInput): Promise<Assessment> {
    const tenantId = actor.user.tenantId;
    const { a } = await this.db.transaction(async (tx) => {
      const item = await this.loadItem(tx, tenantId, itemId);
      const a = await this.loadDraft(tx, tenantId, item.assessmentId, input.expectedVersion);
      if (input.labourDepartmentId) await this.assertDepartment(tx, tenantId, input.labourDepartmentId);

      const patch: Partial<ItemRow> = {};
      const keys = [
        'action',
        'description',
        'partNumber',
        'quantity',
        'unitPriceRial',
        'labourDepartmentId',
        'labourRial',
        'evidence',
      ] as const;
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of keys) {
        const value = input[key];
        if (value === undefined || value === item[key]) continue;
        (patch as Record<string, unknown>)[key] = value;
        before[key] = item[key];
        after[key] = value;
      }
      if (!Object.keys(patch).length) return { item, a };
      // A changed line needs a fresh decision even if the old one was approved.
      await tx
        .update(assessmentItems)
        .set({ ...patch, changed: true, approvalStatus: 'pending', updatedAt: new Date() })
        .where(eq(assessmentItems.id, item.id));
      const saved = await this.touch(tx, a);
      await this.audit.record(tx, actor, {
        entityType: 'assessment',
        entityId: a.id,
        caseId: a.caseId,
        action: 'assessment.item_updated',
        before: { itemId: item.id, lineNo: item.lineNo, ...before },
        after: { itemId: item.id, lineNo: item.lineNo, ...after },
        snapshot: { version: saved.version, row: saved },
      });
      return { item, a: saved };
    });
    return this.get(actor, a.id);
  }

  async removeItem(actor: Actor, itemId: string, input: RemoveAssessmentItemInput): Promise<Assessment> {
    const tenantId = actor.user.tenantId;
    const assessmentId = await this.db.transaction(async (tx) => {
      const item = await this.loadItem(tx, tenantId, itemId);
      const a = await this.loadDraft(tx, tenantId, item.assessmentId, input.expectedVersion);
      // Only draft lines are deleted; the copy in the previous version remains.
      await tx.delete(assessmentItems).where(eq(assessmentItems.id, item.id));
      const saved = await this.touch(tx, a);
      await this.audit.record(tx, actor, {
        entityType: 'assessment',
        entityId: a.id,
        caseId: a.caseId,
        action: 'assessment.item_removed',
        before: {
          itemId: item.id,
          lineNo: item.lineNo,
          description: item.description,
          quantity: item.quantity,
          unitPriceRial: item.unitPriceRial,
          labourRial: item.labourRial,
        },
        snapshot: { version: saved.version, row: saved },
      });
      return a.id;
    });
    return this.get(actor, assessmentId);
  }

  async finalize(actor: Actor, assessmentId: string, input: FinalizeAssessmentInput): Promise<Assessment> {
    const tenantId = actor.user.tenantId;
    const forecast = input.forecastDeliveryAt ? new Date(input.forecastDeliveryAt) : null;
    await this.db.transaction(async (tx) => {
      const a = await this.loadDraft(tx, tenantId, assessmentId, input.expectedVersion);
      let kase = await this.cases.loadForWrite(tx, tenantId, a.caseId);
      const items = await tx.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, a.id));
      if (!items.length) throw badRequest('EMPTY_ASSESSMENT', 'کارشناسی بدون قلم را نمی‌توان نهایی کرد');
      const totals = totalsOf(items);

      let previous: AssessmentRow | null = null;
      let needsAuthorization = true;
      if (a.previousId) {
        previous = await this.loadRow(tx, tenantId, a.previousId);
        const previousItems = await tx
          .select({ id: assessmentItems.id })
          .from(assessmentItems)
          .where(eq(assessmentItems.assessmentId, previous.id));
        const kept = new Set(items.map((i) => i.originItemId));
        const removed = previousItems.filter((p) => !kept.has(p.id)).length;
        const changed = items.filter((i) => i.changed).length;
        if (!changed && !removed) {
          throw badRequest('NO_CHANGES', 'الحاقیه هیچ تغییری نسبت به نسخه قبل ندارد');
        }
        // Removing lines only lowers the cost; new or changed lines need a new decision.
        needsAuthorization = changed > 0 || totals.totalRial > previous.partsRial + previous.labourRial;
      }

      const now = new Date();
      let blockerId: string | null = null;
      if (needsAuthorization) {
        const label = a.kind === 'supplement' ? `الحاقیه نسخه ${toPersianDigits(a.versionNo)}` : 'کارشناسی اولیه';
        const blocker = await this.blockers.insert(tx, actor, a.caseId, {
          taskId: null,
          reason: 'authorization',
          description: `در انتظار مجوز ${label}`,
          // The case has been waiting since the assessment (or, for hidden damage, the discovery).
          occurredAt: (a.discoveredAt ?? a.assessedAt) < now ? (a.discoveredAt ?? a.assessedAt) : now,
        });
        blockerId = blocker.id;
      }
      const status: AuthorizationStatus = needsAuthorization ? 'pending' : 'not_required';
      const [saved] = await tx
        .update(assessments)
        .set({
          status: 'final',
          finalizedAt: now,
          finalizedBy: actor.user.id,
          partsRial: totals.partsRial,
          labourRial: totals.labourRial,
          approvedRial: needsAuthorization ? null : totals.totalRial,
          authorizationStatus: status,
          blockerId,
          updatedAt: now,
          version: a.version + 1,
        })
        .where(and(eq(assessments.id, a.id), eq(assessments.version, a.version)))
        .returning();
      if (!saved) throw versionConflict();
      if (!needsAuthorization) {
        await tx
          .update(assessmentItems)
          .set({ approvalStatus: 'approved', updatedAt: now })
          .where(and(eq(assessmentItems.assessmentId, a.id), eq(assessmentItems.approvalStatus, 'pending')));
      }
      await this.audit.record(tx, actor, {
        entityType: 'assessment',
        entityId: a.id,
        caseId: a.caseId,
        action: 'assessment.finalized',
        reason: input.note ?? null,
        after: {
          versionNo: a.versionNo,
          totalRial: totals.totalRial,
          deltaRial: previous ? totals.totalRial - (previous.partsRial + previous.labourRial) : null,
          authorizationStatus: status,
        },
        snapshot: { version: saved.version, row: saved },
      });

      if (previous) await this.supersede(tx, actor, previous, a.versionNo, now);

      if (a.kind === 'initial' && needsAuthorization && PRE_APPROVAL_STAGES.includes(kase.stage)) {
        kase = await this.cases.applyStage(
          tx,
          actor,
          kase,
          { stage: 'awaiting_approval' },
          'خودکار: کارشناسی نهایی و در انتظار مجوز',
        );
      }
      if (forecast) {
        const label = a.kind === 'supplement' ? `الحاقیه نسخه ${toPersianDigits(a.versionNo)}` : 'کارشناسی';
        await this.cases.applyForecast(tx, actor, kase, forecast, `به‌روزرسانی پیش‌بینی تحویل با ${label}`);
      }
    });
    return this.get(actor, assessmentId);
  }

  async recordAuthorization(actor: Actor, assessmentId: string, input: RecordAuthorizationInput): Promise<Assessment> {
    const tenantId = actor.user.tenantId;
    const at = input.at ? new Date(input.at) : new Date();
    assertNotFuture(at, 'زمان مجوز نمی‌تواند در آینده باشد');
    await this.db.transaction(async (tx) => {
      const a = await this.loadRow(tx, tenantId, assessmentId);
      if (a.version !== input.expectedVersion) throw versionConflict(a.version);
      await this.cases.loadForWrite(tx, tenantId, a.caseId);
      if (a.status === 'superseded') {
        throw badRequest('ASSESSMENT_SUPERSEDED', 'این نسخه با الحاقیه جایگزین شده است؛ مجوز را روی نسخه جدید ثبت کنید');
      }
      if (a.status !== 'final' || a.authorizationStatus !== 'pending') {
        throw badRequest('AUTHORIZATION_NOT_PENDING', 'این نسخه در انتظار مجوز نیست');
      }
      // Staff often record afterwards: the decision may predate its entry in Manage, not the assessment.
      if (at.getTime() < a.assessedAt.getTime() - MINUTE_TOLERANCE_MS) {
        throw badRequest('INVALID_TIME', 'زمان مجوز نمی‌تواند قبل از زمان کارشناسی باشد');
      }

      const items = await tx.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, a.id));
      const ids = new Set(items.map((i) => i.id));
      const rejected = new Set(input.decision === 'rejected' ? items.map((i) => i.id) : input.rejectedItemIds);
      if ([...rejected].some((id) => !ids.has(id))) {
        throw badRequest('INVALID_ITEM', 'قلم ردشده متعلق به این نسخه نیست');
      }
      if (input.decision === 'partially_approved' && rejected.size === items.length) {
        throw badRequest('INVALID_DECISION', 'وقتی همه اقلام رد شده‌اند، تصمیم را «رد» ثبت کنید');
      }
      if (input.decision === 'approved' && rejected.size) {
        throw badRequest('INVALID_DECISION', 'برای رد برخی اقلام، تصمیم را «تأیید جزئی» ثبت کنید');
      }

      // Lines carried over unchanged keep their earlier decision; the rest are decided now.
      const decided = items.map((i) => ({
        ...i,
        approvalStatus: rejected.has(i.id)
          ? 'rejected'
          : i.approvalStatus === 'pending' || input.decision === 'approved'
            ? 'approved'
            : i.approvalStatus,
      }));
      for (const status of ['approved', 'rejected'] as const) {
        const target = decided.filter((i) => i.approvalStatus === status).map((i) => i.id);
        if (target.length) {
          await tx
            .update(assessmentItems)
            .set({ approvalStatus: status, updatedAt: new Date() })
            .where(inArray(assessmentItems.id, target));
        }
      }
      const totals = totalsOf(decided);

      const [saved] = await tx
        .update(assessments)
        .set({
          authorizationStatus: input.decision,
          authorizationSource: input.source,
          authorizationMethod: input.method,
          authorizationRef: input.reference ?? null,
          authorizationAt: at,
          authorizationNote: input.note ?? null,
          authorizationRecordedBy: actor.user.id,
          approvedRial: totals.approvedRial,
          updatedAt: new Date(),
          version: a.version + 1,
        })
        .where(and(eq(assessments.id, a.id), eq(assessments.version, a.version)))
        .returning();
      if (!saved) throw versionConflict();
      await this.audit.record(tx, actor, {
        entityType: 'assessment',
        entityId: a.id,
        caseId: a.caseId,
        action: 'assessment.authorization_recorded',
        reason: input.note ?? null,
        occurredAt: at,
        after: {
          versionNo: a.versionNo,
          decision: input.decision,
          source: input.source,
          method: input.method,
          reference: input.reference ?? null,
          approvedRial: totals.approvedRial,
          rejectedItems: rejected.size,
        },
        snapshot: { version: saved.version, row: saved },
      });

      // The decision ends the wait, whatever it is; a rejection is followed up
      // by a new supplement or a customer decision, not by this blocker.
      await this.closeBlocker(tx, actor, a.blockerId, at, 'ثبت تصمیم مجوز');
    });
    return this.get(actor, assessmentId);
  }

  // ----------------------------------------------------------------- queries

  async list(actor: Actor, caseId: string): Promise<Assessment[]> {
    await this.cases.detail(actor, caseId); // tenant check + 404
    return this.load(actor.user.tenantId, eq(assessments.caseId, caseId));
  }

  async get(actor: Actor, id: string): Promise<Assessment> {
    const [a] = await this.load(actor.user.tenantId, eq(assessments.id, id));
    if (!a) throw notFound('کارشناسی');
    return a;
  }

  private async load(tenantId: string, where: ReturnType<typeof eq>): Promise<Assessment[]> {
    const rows = await this.db
      .select({
        a: assessments,
        createdByName: createdByUser.displayName,
        finalizedByName: finalizedByUser.displayName,
        authRecordedByName: authRecordedByUser.displayName,
      })
      .from(assessments)
      .innerJoin(createdByUser, eq(createdByUser.id, assessments.createdBy))
      .leftJoin(finalizedByUser, eq(finalizedByUser.id, assessments.finalizedBy))
      .leftJoin(authRecordedByUser, eq(authRecordedByUser.id, assessments.authorizationRecordedBy))
      .where(and(eq(assessments.tenantId, tenantId), where))
      .orderBy(asc(assessments.versionNo));
    if (!rows.length) return [];

    const caseIds = [...new Set(rows.map((r) => r.a.caseId))];
    // Totals of every version of these cases, for the delta against the previous one.
    const all = await this.db
      .select({ id: assessments.id, partsRial: assessments.partsRial, labourRial: assessments.labourRial })
      .from(assessments)
      .where(and(eq(assessments.tenantId, tenantId), inArray(assessments.caseId, caseIds)));
    const totalById = new Map(all.map((x) => [x.id, x.partsRial + x.labourRial]));

    const items = await this.db
      .select({ i: assessmentItems, d: departments })
      .from(assessmentItems)
      .leftJoin(departments, eq(departments.id, assessmentItems.labourDepartmentId))
      .where(
        and(
          eq(assessmentItems.tenantId, tenantId),
          inArray(
            assessmentItems.assessmentId,
            rows.map((r) => r.a.id),
          ),
        ),
      )
      .orderBy(asc(assessmentItems.lineNo));

    return rows.map(({ a, createdByName, finalizedByName, authRecordedByName }) => {
      const own = items.filter((x) => x.i.assessmentId === a.id);
      const live = totalsOf(own.map((x) => x.i));
      const totals: AssessmentTotals =
        a.status === 'draft'
          ? live
          : {
              partsRial: a.partsRial,
              labourRial: a.labourRial,
              totalRial: a.partsRial + a.labourRial,
              approvedRial: a.approvedRial ?? a.partsRial + a.labourRial,
            };
      const previousTotal = a.previousId ? totalById.get(a.previousId) : undefined;
      const deltaRial = previousTotal === undefined ? null : totals.totalRial - previousTotal;
      return {
        id: a.id,
        caseId: a.caseId,
        versionNo: a.versionNo,
        kind: a.kind as Assessment['kind'],
        status: a.status as Assessment['status'],
        assessorName: a.assessorName,
        assessorOrg: a.assessorOrg,
        assessedAt: a.assessedAt.toISOString(),
        reason: a.reason,
        discoveredAt: iso(a.discoveredAt),
        notes: a.notes,
        finalizedAt: iso(a.finalizedAt),
        finalizedBy: a.finalizedBy ? { id: a.finalizedBy, displayName: finalizedByName! } : null,
        authorizationStatus: a.authorizationStatus as AuthorizationStatus,
        authorization:
          a.authorizationAt && a.authorizationRecordedBy
            ? {
                source: a.authorizationSource as NonNullable<Assessment['authorization']>['source'],
                method: a.authorizationMethod as NonNullable<Assessment['authorization']>['method'],
                reference: a.authorizationRef,
                at: a.authorizationAt.toISOString(),
                note: a.authorizationNote,
                recordedBy: { id: a.authorizationRecordedBy, displayName: authRecordedByName! },
              }
            : null,
        blockerId: a.blockerId,
        items: own.map(({ i, d }): AssessmentItem => ({
          id: i.id,
          lineNo: i.lineNo,
          action: i.action as AssessmentItem['action'],
          description: i.description,
          partNumber: i.partNumber,
          quantity: i.quantity,
          unitPriceRial: i.unitPriceRial,
          labourDepartment: d ? { id: d.id, name: d.name } : null,
          labourRial: i.labourRial,
          evidence: i.evidence,
          approvalStatus: i.approvalStatus as AssessmentItem['approvalStatus'],
          originItemId: i.originItemId,
          changed: i.changed,
        })),
        totals,
        deltaRial,
        requiresFinancialReview: a.kind === 'supplement' && a.status !== 'draft' && (deltaRial ?? 0) > 0,
        createdAt: a.createdAt.toISOString(),
        createdBy: { id: a.createdBy, displayName: createdByName },
        version: a.version,
      };
    });
  }

  // ---------------------------------------------------------------- helpers

  private async versionsOf(tx: DbOrTx, tenantId: string, caseId: string): Promise<AssessmentRow[]> {
    return tx
      .select()
      .from(assessments)
      .where(and(eq(assessments.tenantId, tenantId), eq(assessments.caseId, caseId)))
      .orderBy(asc(assessments.versionNo));
  }

  private async loadRow(tx: DbOrTx, tenantId: string, id: string): Promise<AssessmentRow> {
    const [a] = await tx
      .select()
      .from(assessments)
      .where(and(eq(assessments.id, id), eq(assessments.tenantId, tenantId)));
    if (!a) throw notFound('کارشناسی');
    return a;
  }

  private async loadDraft(tx: DbOrTx, tenantId: string, id: string, expectedVersion: number) {
    const a = await this.loadRow(tx, tenantId, id);
    if (a.version !== expectedVersion) throw versionConflict(a.version);
    if (a.status !== 'draft') {
      throw badRequest('ASSESSMENT_FINAL', 'نسخه نهایی کارشناسی قابل تغییر نیست؛ برای تغییر، الحاقیه ثبت کنید');
    }
    await this.cases.loadForWrite(tx, tenantId, a.caseId);
    return a;
  }

  private async loadItem(tx: DbOrTx, tenantId: string, id: string): Promise<ItemRow> {
    const [item] = await tx
      .select()
      .from(assessmentItems)
      .where(and(eq(assessmentItems.id, id), eq(assessmentItems.tenantId, tenantId)));
    if (!item) throw notFound('قلم کارشناسی');
    return item;
  }

  /** Bumps the assessment version so concurrent editors of the same draft conflict. */
  private async touch(tx: DbOrTx, a: AssessmentRow): Promise<AssessmentRow> {
    const [row] = await tx
      .update(assessments)
      .set({ updatedAt: new Date(), version: a.version + 1 })
      .where(and(eq(assessments.id, a.id), eq(assessments.version, a.version)))
      .returning();
    if (!row) throw versionConflict();
    return row;
  }

  private async supersede(tx: DbOrTx, actor: Actor, previous: AssessmentRow, byVersion: number, at: Date) {
    const [saved] = await tx
      .update(assessments)
      .set({ status: 'superseded', updatedAt: at, version: previous.version + 1 })
      .where(and(eq(assessments.id, previous.id), eq(assessments.version, previous.version)))
      .returning();
    if (!saved) throw versionConflict();
    await this.audit.record(tx, actor, {
      entityType: 'assessment',
      entityId: previous.id,
      caseId: previous.caseId,
      action: 'assessment.superseded',
      after: { versionNo: previous.versionNo, supersededBy: byVersion },
      snapshot: { version: saved.version, row: saved },
    });
    // A wait for the old version's authorization is replaced by the new one's.
    if (previous.authorizationStatus === 'pending') {
      await this.closeBlocker(
        tx,
        actor,
        previous.blockerId,
        at,
        `جایگزین با الحاقیه نسخه ${toPersianDigits(byVersion)}`,
      );
    }
  }

  private async closeBlocker(tx: DbOrTx, actor: Actor, blockerId: string | null, at: Date, note: string) {
    if (!blockerId) return;
    const [b] = await tx.select().from(blockers).where(eq(blockers.id, blockerId));
    if (b && !b.resolvedAt) await this.blockers.close(tx, actor, b, at, note);
  }

  private async assertDepartment(tx: DbOrTx, tenantId: string, departmentId: string) {
    const [d] = await tx
      .select({ isActive: departments.isActive })
      .from(departments)
      .where(and(eq(departments.id, departmentId), eq(departments.tenantId, tenantId)));
    if (!d || !d.isActive) throw badRequest('INVALID_DEPARTMENT', 'واحد انتخاب‌شده معتبر نیست');
  }
}
