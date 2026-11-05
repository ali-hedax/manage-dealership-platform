import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  formatJalali,
  type DiscrepancyAssignInput,
  type DiscrepancyKind,
  type DiscrepancyListQuery,
  type DiscrepancyResolveInput,
  type DiscrepancyStatus,
  type PartDiscrepancy,
  type TimelineEvent,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { blockers, cases, partDiscrepancies, partRequests, users, vehicles } from '../db/schema';
import { PURCHASE_SOURCES } from '../finance/finance.service';

type Row = typeof partDiscrepancies.$inferSelect;
interface Finding {
  key: string;
  kind: DiscrepancyKind;
  caseId: string;
  partRequestId: string | null;
  blockerId: string | null;
  detail: string;
}

const assignee = alias(users, 'discrepancy_assignee');
const resolver = alias(users, 'discrepancy_resolver');
const at = (d: Date | null) => (d ? formatJalali(d.toISOString(), { time: true }) : 'نامعلوم');

/** Who may see and review the queue: parts staff, supervisors and the service manager. */
export const canReview = (p: Set<string>) => p.has('part.manage') || p.has('report.manager');

/**
 * Parts discrepancy queue (#11). Rules only find facts that contradict each
 * other; they never decide who is at fault or that a case is settled. Each
 * finding has a stable key, so detecting again never duplicates an item.
 */
@Injectable()
export class DiscrepanciesService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  /** Runs the rules for one dealership and records new findings (idempotent). */
  async detect(actor: Actor): Promise<void> {
    const tenantId = actor.user.tenantId;
    const isTest = actor.user.isTestTenant;
    const findings = await this.findings(tenantId);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      if (findings.length) {
        const inserted = await tx
          .insert(partDiscrepancies)
          .values(
            findings.map((f) => ({
              id: newId(),
              tenantId,
              caseId: f.caseId,
              partRequestId: f.partRequestId,
              blockerId: f.blockerId,
              kind: f.kind,
              dedupeKey: f.key,
              detail: f.detail,
              detectedAt: now,
              isTest,
            })),
          )
          .onConflictDoNothing()
          .returning();
        for (const row of inserted) {
          await this.audit.record(tx, actor, {
            entityType: 'discrepancy', entityId: row.id, caseId: row.caseId,
            action: 'discrepancy.detected', after: { kind: row.kind, detail: row.detail },
            snapshot: { version: row.version, row },
          });
        }
      }
      // Mark (never close) open items whose condition no longer holds, and unmark if it returns.
      const keys = findings.map((f) => f.key);
      const active = and(eq(partDiscrepancies.tenantId, tenantId), inArray(partDiscrepancies.status, ['open', 'in_review']));
      const changed = await tx.select().from(partDiscrepancies).where(and(active, or(
        and(isNull(partDiscrepancies.conditionClearedAt), keys.length ? sql`${partDiscrepancies.dedupeKey} not in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})` : sql`true`),
        and(isNotNull(partDiscrepancies.conditionClearedAt), keys.length ? inArray(partDiscrepancies.dedupeKey, keys) : sql`false`),
      )));
      for (const before of changed) {
        const conditionClearedAt = keys.includes(before.dedupeKey) ? null : now;
        const [saved] = await tx.update(partDiscrepancies)
          .set({ conditionClearedAt, updatedAt: now, version: before.version + 1 })
          .where(and(eq(partDiscrepancies.id, before.id), eq(partDiscrepancies.version, before.version), active))
          .returning();
        if (!saved) continue;
        await this.audit.record(tx, actor, {
          entityType: 'discrepancy', entityId: saved.id, caseId: saved.caseId,
          action: conditionClearedAt ? 'discrepancy.condition_cleared' : 'discrepancy.condition_returned',
          before: { conditionClearedAt: before.conditionClearedAt }, after: { conditionClearedAt },
          snapshot: { version: saved.version, row: saved },
        });
      }
    });
  }

  private async findings(tenantId: string): Promise<Finding[]> {
    const out: Finding[] = [];
    const parts = await this.db
      .select()
      .from(partRequests)
      .innerJoin(cases, eq(cases.id, partRequests.caseId))
      .where(and(eq(partRequests.tenantId, tenantId), eq(cases.status, 'open')));
    const byCase = new Map<string, (typeof parts)[number]['part_requests'][]>();
    for (const { part_requests: p } of parts) byCase.set(p.caseId, [...(byCase.get(p.caseId) ?? []), p]);

    // 1. "Part not arrived" is open although the part was handed over to the repair unit.
    const shortages = await this.db
      .select()
      .from(blockers)
      .innerJoin(cases, eq(cases.id, blockers.caseId))
      .where(and(eq(blockers.tenantId, tenantId), eq(blockers.reason, 'part_not_arrived'), isNull(blockers.resolvedAt), eq(cases.status, 'open')));
    for (const { blockers: b } of shortages) {
      const caseParts = byCase.get(b.caseId) ?? [];
      const linked = b.partRequestId ? caseParts.find((p) => p.id === b.partRequestId) : undefined;
      const handed = linked
        ? linked.status === 'handed_over'
          ? [linked]
          : []
        : caseParts.length && caseParts.every((p) => p.status === 'handed_over' || p.status === 'cancelled')
          ? caseParts.filter((p) => p.status === 'handed_over')
          : [];
      if (!handed.length) continue;
      const p = handed[0]!;
      out.push({
        key: `shortage:${b.id}`,
        kind: 'handover_vs_shortage',
        caseId: b.caseId,
        partRequestId: p.id,
        blockerId: b.id,
        detail: `مانع «قطعه نرسیده» از ${at(b.occurredAt)} باز است، اما تحویل ${linked ? `«${p.description}»` : 'همه قطعه‌های این پرونده'} به واحد تعمیر ${p.handedOverAt ? `در ${at(p.handedOverAt)}` : ''}${p.recipientName ? ` به ${p.recipientName}` : ''} ثبت شده است.`,
      });
    }

    for (const { part_requests: p } of parts) {
      // 2. Wrong or defective part reported at receipt.
      if (p.status === 'rejected') {
        out.push({
          key: `rejected:${p.id}:${p.receivedAt?.toISOString() ?? ''}`,
          kind: 'wrong_or_defective',
          caseId: p.caseId,
          partRequestId: p.id,
          blockerId: null,
          detail: `«${p.description}» در رسید ${at(p.receivedAt)} ${p.inspection === 'wrong' ? 'اشتباه' : 'معیوب'} گزارش شد${p.inspectionNote ? `: ${p.inspectionNote}` : ''}. پیگیری مرجوعی یا سفارش دوباره لازم است.`,
        });
      }
      // 3. Supply and handover records contradict each other.
      const purchased = PURCHASE_SOURCES.includes(p.source);
      if (purchased && ['received', 'handed_over'].includes(p.status) && !p.orderedAt) {
        out.push({ key: `no-order:${p.id}`, kind: 'supply_inconsistent', caseId: p.caseId, partRequestId: p.id, blockerId: null, detail: `«${p.description}» رسید یا تحویل دارد، اما سفارشی برای آن ثبت نشده است.` });
      }
      if (p.status === 'handed_over' && !p.receivedAt && !p.reservedAt) {
        out.push({ key: `no-receipt:${p.id}`, kind: 'supply_inconsistent', caseId: p.caseId, partRequestId: p.id, blockerId: null, detail: `«${p.description}» به واحد تحویل شده، اما رسید انبار یا رزرو آن ثبت نشده است.` });
      }
      if (p.handedOverAt && p.receivedAt && p.handedOverAt < p.receivedAt) {
        out.push({ key: `order:${p.id}`, kind: 'supply_inconsistent', caseId: p.caseId, partRequestId: p.id, blockerId: null, detail: `زمان تحویل «${p.description}» به واحد (${at(p.handedOverAt)}) پیش از زمان رسید آن (${at(p.receivedAt)}) ثبت شده است.` });
      }
    }
    return out;
  }

  // ------------------------------------------------------------- commands

  async assign(actor: Actor, id: string, input: DiscrepancyAssignInput): Promise<PartDiscrepancy> {
    if (!actor.user.permissions.has('part.manage')) throw forbidden();
    await this.db.transaction(async (tx) => {
      const row = await this.load(tx, actor, id, input.expectedVersion);
      if (row.status === 'resolved' || row.status === 'dismissed') throw badRequest('DISCREPANCY_CLOSED', 'این مغایرت قبلاً تعیین تکلیف شده است');
      if (input.assigneeUserId) {
        const [u] = await tx
          .select({ id: users.id, roles: users.roles })
          .from(users)
          .where(and(eq(users.id, input.assigneeUserId), eq(users.tenantId, actor.user.tenantId), eq(users.isActive, true)));
        if (!u) throw badRequest('INVALID_ASSIGNEE', 'مسئول انتخاب‌شده در این نمایندگی معتبر نیست');
      }
      const status: DiscrepancyStatus = input.assigneeUserId ? 'in_review' : 'open';
      const saved = await this.save(tx, row, { assigneeUserId: input.assigneeUserId, status });
      await this.audit.record(tx, actor, {
        entityType: 'discrepancy',
        entityId: id,
        caseId: row.caseId,
        action: 'discrepancy.assigned',
        before: { assigneeUserId: row.assigneeUserId, status: row.status },
        after: { assigneeUserId: input.assigneeUserId, status },
        snapshot: { version: saved.version, row: saved },
      });
    });
    return this.get(actor, id);
  }

  /** Only a person closes an item, with the reason and what was checked. */
  async resolve(actor: Actor, id: string, input: DiscrepancyResolveInput): Promise<PartDiscrepancy> {
    if (!actor.user.permissions.has('part.manage')) throw forbidden();
    await this.db.transaction(async (tx) => {
      const row = await this.load(tx, actor, id, input.expectedVersion);
      if (row.status === 'resolved' || row.status === 'dismissed') throw badRequest('DISCREPANCY_CLOSED', 'این مغایرت قبلاً تعیین تکلیف شده است');
      const saved = await this.save(tx, row, {
        status: input.outcome,
        resolvedAt: new Date(),
        resolvedBy: actor.user.id,
        resolutionReason: input.reason,
        assigneeUserId: row.assigneeUserId ?? actor.user.id,
      });
      await this.audit.record(tx, actor, {
        entityType: 'discrepancy',
        entityId: id,
        caseId: row.caseId,
        action: `discrepancy.${input.outcome}`,
        reason: input.reason,
        before: { status: row.status },
        after: { status: input.outcome },
        snapshot: { version: saved.version, row: saved },
      });
    });
    return this.get(actor, id);
  }

  // -------------------------------------------------------------- queries

  async list(actor: Actor, q: DiscrepancyListQuery): Promise<PartDiscrepancy[]> {
    if (!canReview(actor.user.permissions)) throw forbidden();
    await this.detect(actor);
    const statuses: DiscrepancyStatus[] =
      q.status === 'active' ? ['open', 'in_review'] : q.status === 'all' ? ['open', 'in_review', 'resolved', 'dismissed'] : [q.status];
    return this.query(actor, and(inArray(partDiscrepancies.status, statuses), ...(q.caseId ? [eq(partDiscrepancies.caseId, q.caseId)] : [])));
  }

  async get(actor: Actor, id: string): Promise<PartDiscrepancy> {
    const [row] = await this.query(actor, eq(partDiscrepancies.id, id));
    if (!row) throw notFound('مغایرت');
    return row;
  }

  /** Detection time plus every recorded review step. */
  async history(actor: Actor, id: string): Promise<{ detectedAt: string; events: TimelineEvent[] }> {
    if (!canReview(actor.user.permissions)) throw forbidden();
    const item = await this.get(actor, id);
    const events = (await this.audit.caseTimeline(actor, item.caseId)).filter((e) => e.entityId === id);
    return { detectedAt: item.detectedAt, events };
  }

  private async query(actor: Actor, where: ReturnType<typeof and>): Promise<PartDiscrepancy[]> {
    const rows = await this.db
      .select({
        d: partDiscrepancies,
        caseNumber: cases.caseNumber,
        plate: vehicles.plate,
        part: partRequests,
        assigneeName: assignee.displayName,
        resolverName: resolver.displayName,
      })
      .from(partDiscrepancies)
      .innerJoin(cases, eq(cases.id, partDiscrepancies.caseId))
      .innerJoin(vehicles, eq(vehicles.id, cases.vehicleId))
      .leftJoin(partRequests, eq(partRequests.id, partDiscrepancies.partRequestId))
      .leftJoin(assignee, eq(assignee.id, partDiscrepancies.assigneeUserId))
      .leftJoin(resolver, eq(resolver.id, partDiscrepancies.resolvedBy))
      .where(and(eq(partDiscrepancies.tenantId, actor.user.tenantId), where))
      .orderBy(desc(partDiscrepancies.detectedAt));
    return rows.map(({ d, caseNumber, plate, part, assigneeName, resolverName }) => ({
      id: d.id,
      kind: d.kind as DiscrepancyKind,
      status: d.status as DiscrepancyStatus,
      caseId: d.caseId,
      caseNumber,
      plate,
      part: part ? { id: part.id, description: part.description, partNumber: part.partNumber, quantity: part.quantity, status: part.status } : null,
      detail: d.detail,
      detectedAt: d.detectedAt.toISOString(),
      conditionClearedAt: d.conditionClearedAt ? d.conditionClearedAt.toISOString() : null,
      assignee: d.assigneeUserId ? { id: d.assigneeUserId, displayName: assigneeName ?? '' } : null,
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      resolvedBy: d.resolvedBy ? { id: d.resolvedBy, displayName: resolverName ?? '' } : null,
      resolutionReason: d.resolutionReason,
      version: d.version,
    }));
  }

  private async load(tx: DbOrTx, actor: Actor, id: string, expectedVersion: number): Promise<Row> {
    const [row] = await tx.select().from(partDiscrepancies).where(and(eq(partDiscrepancies.id, id), eq(partDiscrepancies.tenantId, actor.user.tenantId)));
    if (!row) throw notFound('مغایرت');
    if (row.version !== expectedVersion) throw versionConflict(row.version);
    return row;
  }

  private async save(tx: DbOrTx, row: Row, patch: Partial<Row>): Promise<Row> {
    const [saved] = await tx
      .update(partDiscrepancies)
      .set({ ...patch, updatedAt: new Date(), version: row.version + 1 })
      .where(and(eq(partDiscrepancies.id, row.id), eq(partDiscrepancies.version, row.version)))
      .returning();
    if (!saved) throw versionConflict();
    return saved;
  }
}
