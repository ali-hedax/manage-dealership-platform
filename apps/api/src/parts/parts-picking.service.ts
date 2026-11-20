import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne, notInArray } from 'drizzle-orm';
import {
  isPartActionAllowed, partFlowState, partIdentifiers,
  type ClosePickingBatch, type CreatePickingBatch, type PickingBatch, type PickingBatchLine, type PickingCandidate,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, conflict, notFound, versionConflict } from '../common/errors';
import { EmdadService } from '../daily-reports/emdad.service';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { assessmentItems, blockers, cases, departments, partRequests, pickingBatches, stockReservations, stockSnapshotItems, tasks, users, vehicles } from '../db/schema';
import { renderChecklistPdf, jalaliStamp, type ChecklistRow } from '../reports/checklist-pdf';
import { PartsService, isParallel, remainingHandover } from './parts.service';

const staleSelection = (part: string) => conflict('PICKING_PART_CHANGED', `اطلاعات برداشت «${part}» تغییر کرده است. فهرست را تازه کنید و در صورت نیاز نوبت جدید بسازید.`);
type BatchRow = typeof pickingBatches.$inferSelect;
type Reservation = { r: typeof stockReservations.$inferSelect; text: string | null };

@Injectable()
export class PartsPickingService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly parts: PartsService,
    private readonly emdad: EmdadService,
  ) {}

  async list(actor: Actor, history: boolean) {
    const db = this.handle.db;
    const tenantId = actor.user.tenantId;
    const pending = await this.batches(db, tenantId, 'pending');
    const closed = history ? await this.batches(db, tenantId, 'closed') : [];
    const reserved = new Set(pending.flatMap((batch) => batch.items.map((item) => item.partId)));
    const { candidates, sections } = await this.candidates(db, tenantId);
    return {
      items: candidates.filter(({ line }) => !reserved.has(line.partId)).map(({ line }) => line),
      departments: sections,
      batches: [...pending, ...closed],
    };
  }

  private async candidates(db: DbOrTx, tenantId: string, ids?: string[]) {
    const rows = await db.select({
      p: partRequests, caseNumber: cases.caseNumber, admissionNo: cases.admissionNo,
      model: vehicles.model, brand: vehicles.brand, plate: vehicles.plate, assessmentDepartment: assessmentItems.labourDepartmentId,
    }).from(partRequests)
      .innerJoin(cases, and(eq(cases.id, partRequests.caseId), eq(cases.tenantId, tenantId)))
      .innerJoin(vehicles, and(eq(vehicles.id, cases.vehicleId), eq(vehicles.tenantId, tenantId)))
      .leftJoin(assessmentItems, and(eq(assessmentItems.id, partRequests.assessmentItemId), eq(assessmentItems.tenantId, tenantId)))
      .where(and(eq(partRequests.tenantId, tenantId), eq(cases.status, 'open'), eq(cases.module, 'accident'),
        ne(cases.stage, 'delivered'), isNull(partRequests.consumedAt), inArray(partRequests.status, ['received', 'reserved', 'ordered']),
        ids ? inArray(partRequests.id, ids) : undefined))
      .orderBy(asc(partRequests.caseId), asc(partRequests.id));
    const sections = await db.select({ id: departments.id, name: departments.name }).from(departments)
      .where(and(eq(departments.tenantId, tenantId), eq(departments.isActive, true))).orderBy(asc(departments.sortOrder), asc(departments.name));
    if (!rows.length) return { candidates: [], sections };

    const partIds = rows.map(({ p }) => p.id);
    const caseIds = [...new Set(rows.map(({ p }) => p.caseId))];
    const emdad = await this.parts.emdadByPart(db, tenantId, partIds);
    const stock = await db.select({ r: stockReservations, text: stockSnapshotItems.locationText }).from(stockReservations)
      .leftJoin(stockSnapshotItems, and(eq(stockSnapshotItems.tenantId, tenantId), eq(stockSnapshotItems.snapshotId, stockReservations.snapshotId),
        eq(stockSnapshotItems.fullStockCode, stockReservations.fullStockCode), eq(stockSnapshotItems.locationAddress, stockReservations.locationAddress)))
      .where(and(eq(stockReservations.tenantId, tenantId), inArray(stockReservations.partRequestId, partIds), eq(stockReservations.status, 'reserved')))
      .orderBy(asc(stockReservations.id));
    const byPart = new Map<string, Reservation[]>();
    for (const row of stock) {
      const group = byPart.get(row.r.partRequestId) ?? [];
      group.push(row);
      byPart.set(row.r.partRequestId, group);
    }

    const activeTasks = await db.select({ id: tasks.id, caseId: tasks.caseId, departmentId: tasks.departmentId }).from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), inArray(tasks.caseId, caseIds), notInArray(tasks.status, ['approved', 'cancelled'])));
    const taskDepartments = new Map(activeTasks.map((task) => [task.id, task.departmentId]));
    const caseDepartments = new Map<string, Set<string>>();
    for (const task of activeTasks) {
      const ids = caseDepartments.get(task.caseId) ?? new Set<string>();
      ids.add(task.departmentId);
      caseDepartments.set(task.caseId, ids);
    }
    const linked = await db.select({ partId: blockers.partRequestId, taskId: blockers.taskId }).from(blockers)
      .where(and(eq(blockers.tenantId, tenantId), inArray(blockers.partRequestId, partIds), isNull(blockers.resolvedAt)));
    const linkedDepartments = new Map<string, Set<string>>();
    for (const row of linked) {
      const departmentId = row.taskId && taskDepartments.get(row.taskId);
      if (!row.partId || !departmentId) continue;
      const ids = linkedDepartments.get(row.partId) ?? new Set<string>();
      ids.add(departmentId);
      linkedDepartments.set(row.partId, ids);
    }
    const sectionIds = new Set(sections.map(({ id }) => id));
    const candidates = rows.flatMap(({ p, assessmentDepartment, ...vehicle }) => {
      const parallel = isParallel(p);
      const category = emdad.get(p.id)?.category;
      const state = partFlowState({ status: p.status, source: p.source, consumedAt: p.consumedAt, emdadCategory: category, parallelStock: parallel });
      const reservations = byPart.get(p.id) ?? [];
      // The existing issue action consumes shelf reservations by ID and accepts whole pieces.
      // If a legacy reservation is fractional, only its whole portion can be issued in that pass.
      let wholeFromShelves = 0;
      for (const { r } of reservations) {
        const quantity = Number(r.quantity);
        wholeFromShelves += Math.floor(quantity);
        if (!Number.isInteger(quantity)) break;
      }
      const available = Math.min(999, remainingHandover(p, reservations.map(({ r }) => r)),
        reservations.length ? wholeFromShelves : 999);
      if ((p.status === 'reserved' && !reservations.length) || (parallel && !reservations.length)) return [];
      if (available < 1 || !isPartActionAllowed(state, 'hand_over') || (!parallel && p.source === 'company' && category === 'cancelled')) return [];
      const linked = linkedDepartments.get(p.id);
      const suggested = linked?.size ? linked : caseDepartments.get(p.caseId);
      const departmentId = assessmentDepartment ?? (suggested?.size === 1 ? [...suggested][0]! : null);
      const line: PickingCandidate = {
        partId: p.id, version: p.version, caseId: p.caseId, caseNumber: vehicle.caseNumber, admissionNo: vehicle.admissionNo,
        vehicle: vehicle.model ?? vehicle.brand ?? 'خودرو', plate: vehicle.plate, description: p.description,
        code: partIdentifiers(p).displayCode ?? '', available, departmentId: departmentId && sectionIds.has(departmentId) ? departmentId : null,
        saleUnitRial: p.salePriceRial,
      };
      return [{ line, reservations }];
    });
    return { candidates, sections };
  }

  private shelves(reservations: Reservation[], quantity: number): PickingBatchLine['shelves'] {
    let left = quantity;
    return reservations.flatMap(({ r, text }) => {
      const take = Math.min(left, Number(r.quantity));
      left -= take;
      return take > 0 ? [{ reservationId: r.id, version: r.version, code: r.fullStockCode, address: (r.locationAddress || text || '').trim(), quantity: take }] : [];
    });
  }

  async create(actor: Actor, input: CreatePickingBatch): Promise<PickingBatch> {
    return this.handle.db.transaction(async (tx) => {
      const tenantId = actor.user.tenantId;
      await this.emdad.lock(tx, tenantId);
      const [known] = await this.batches(tx, tenantId, { id: input.id });
      if (known) {
        const replay = input.items.length === known.items.length && input.items.every((i) => known.items.some((x) =>
          x.partId === i.partId && x.version === i.expectedVersion && x.quantity === i.quantity && x.departmentId === i.departmentId));
        if (!replay) throw conflict('PICKING_ID_REUSED', 'شناسهٔ نوبت برای انتخاب دیگری استفاده شده است');
        return known;
      }
      const pending = await this.batches(tx, tenantId, 'pending');
      const reserved = new Set(pending.flatMap((batch) => batch.items.map((item) => item.partId)));
      const requested = input.items.map(({ partId }) => partId);
      const { candidates, sections } = await this.candidates(tx, tenantId, requested);
      const byId = new Map(candidates.map((c) => [c.line.partId, c]));
      const sectionNames = new Map(sections.map(({ id, name }) => [id, name]));
      const items = input.items.map((item): PickingBatchLine => {
        const candidate = byId.get(item.partId);
        if (!candidate) throw staleSelection('قطعهٔ انتخاب‌شده');
        const { line, reservations } = candidate;
        if (reserved.has(line.partId)) throw conflict('PICKING_ALREADY_PENDING', `«${line.description}» در نوبت باز دیگری است`);
        if (item.expectedVersion !== line.version || item.quantity > line.available) throw staleSelection(line.description);
        const department = item.departmentId ? sectionNames.get(item.departmentId) : null;
        if (item.departmentId && !department) throw badRequest('INVALID_DEPARTMENT', 'بخش کاری انتخاب‌شده معتبر نیست');
        return { ...line, quantity: item.quantity, departmentId: item.departmentId, department: department ?? null, shelves: this.shelves(reservations, item.quantity) };
      });
      const [row] = await tx.insert(pickingBatches).values({
        id: input.id, tenantId, items, createdBy: actor.user.id, isTest: actor.user.isTestTenant,
      }).onConflictDoNothing().returning();
      if (!row) throw conflict('PICKING_ID_REUSED', 'شناسهٔ نوبت قبلاً استفاده شده است');
      await this.record(tx, actor, row, 'created');
      return this.toBatch(row, actor.user.displayName);
    });
  }

  async close(actor: Actor, id: string, input: ClosePickingBatch) {
    return this.handle.db.transaction(async (tx) => {
      const tenantId = actor.user.tenantId;
      await this.emdad.lock(tx, tenantId);
      const [batch] = await tx.select().from(pickingBatches)
        .where(and(eq(pickingBatches.tenantId, tenantId), eq(pickingBatches.id, id))).for('update');
      if (!batch) throw notFound('نوبت جمع‌آوری');
      if (batch.status !== 'pending') throw conflict('PICKING_BATCH_CLOSED', 'این نوبت قبلاً بسته شده است؛ تاریخچه را بررسی کنید');
      if (batch.version !== input.expectedVersion) throw versionConflict(batch.version);
      const now = new Date();
      if (input.action === 'deliver') await this.deliver(tx, actor, batch.items, input, now);
      const [row] = await tx.update(pickingBatches).set({
        status: input.action === 'deliver' ? 'delivered' : 'cancelled',
        closedAt: now, closedBy: actor.user.id, version: batch.version + 1,
        recipientName: input.action === 'deliver' ? input.recipientName : null,
      }).where(and(eq(pickingBatches.tenantId, tenantId), eq(pickingBatches.id, id), eq(pickingBatches.version, batch.version))).returning();
      if (!row) throw versionConflict();
      await this.record(tx, actor, row, row.status);
      return { id, status: row.status };
    });
  }

  private async deliver(tx: DbOrTx, actor: Actor, items: PickingBatchLine[], input: Extract<ClosePickingBatch, { action: 'deliver' }>, now: Date) {
    const tenantId = actor.user.tenantId;
    const ids = items.map(({ partId }) => partId);
    const prices = new Map(input.prices.map((p) => [p.partId, p.saleUnitRial]));
    const missing = new Set(items.filter((item) => item.saleUnitRial === null).map((item) => item.partId));
    if (prices.size !== input.prices.length || prices.size !== missing.size || [...prices.keys()].some((id) => !missing.has(id))) {
      throw badRequest('PICKING_PRICES_INVALID', 'قیمت فروش را برای همهٔ قطعات بدون قیمت وارد کنید');
    }
    await tx.select({ id: partRequests.id }).from(partRequests).where(and(eq(partRequests.tenantId, tenantId), inArray(partRequests.id, ids)))
      .orderBy(asc(partRequests.caseId), asc(partRequests.id)).for('update');
    await tx.select({ id: stockReservations.id }).from(stockReservations)
      .where(and(eq(stockReservations.tenantId, tenantId), inArray(stockReservations.partRequestId, ids), eq(stockReservations.status, 'reserved')))
      .orderBy(asc(stockReservations.partRequestId), asc(stockReservations.id)).for('update');
    await this.assertCurrent(tx, tenantId, items);
    for (const item of items) {
      await this.parts.actIn(tx, actor, item.partId, {
        action: 'hand_over', expectedVersion: item.version, departmentId: item.departmentId,
        recipientName: input.recipientName, deliveryQuantity: item.quantity, salePriceRial: prices.get(item.partId),
      }, now);
    }
  }

  private async assertCurrent(db: DbOrTx, tenantId: string, items: PickingBatchLine[]) {
    const { candidates } = await this.candidates(db, tenantId, items.map(({ partId }) => partId));
    const current = new Map(candidates.map((entry) => [entry.line.partId, entry]));
    for (const item of items) {
      const row = current.get(item.partId);
      const shelves = row ? this.shelves(row.reservations, item.quantity) : [];
      const sameShelves = shelves.length === item.shelves.length && shelves.every((shelf, i) => {
        const original = item.shelves[i];
        return original && shelf.reservationId === original.reservationId && shelf.version === original.version &&
          shelf.quantity === original.quantity && shelf.code === original.code && shelf.address === original.address;
      });
      if (!row || row.line.version !== item.version || row.line.available < item.quantity || !sameShelves) throw staleSelection(item.description);
    }
  }

  private async record(tx: DbOrTx, actor: Actor, row: BatchRow, action: string) {
    await this.audit.record(tx, actor, {
      entityType: 'picking_batch', entityId: row.id, action: `picking_batch.${action}`,
      after: { status: row.status, recipientName: row.recipientName, items: row.items.map(({ partId, quantity, departmentId }) => ({ partId, quantity, departmentId })) },
      snapshot: { version: row.version, row },
    });
  }

  private toBatch(row: BatchRow, createdByName: string): PickingBatch {
    return {
      id: row.id, status: row.status, version: row.version, items: row.items, recipientName: row.recipientName,
      createdAt: row.createdAt.toISOString(), closedAt: row.closedAt?.toISOString() ?? null, createdByName,
    };
  }

  private async batches(db: DbOrTx, tenantId: string, scope: 'pending' | 'closed' | { id: string }): Promise<PickingBatch[]> {
    const filter = scope === 'pending' ? eq(pickingBatches.status, 'pending')
      : scope === 'closed' ? ne(pickingBatches.status, 'pending') : eq(pickingBatches.id, scope.id);
    const query = db.select({ batch: pickingBatches, createdByName: users.displayName }).from(pickingBatches)
      .innerJoin(users, and(eq(users.id, pickingBatches.createdBy), eq(users.tenantId, tenantId)))
      .where(and(eq(pickingBatches.tenantId, tenantId), filter))
      .orderBy(desc(pickingBatches.createdAt), desc(pickingBatches.id));
    const rows = await (scope === 'closed' ? query.limit(50) : query);
    return rows.map(({ batch, createdByName }) => this.toBatch(batch, createdByName));
  }

  async pdf(actor: Actor, id: string) {
    const [batch] = await this.batches(this.handle.db, actor.user.tenantId, { id });
    if (!batch) throw notFound('نوبت جمع‌آوری');
    if (batch.status === 'pending') await this.assertCurrent(this.handle.db, actor.user.tenantId, batch.items);
    const shortId = id.slice(0, 8).toUpperCase();
    const state = { pending: 'در انتظار تحویل', delivered: 'تحویل‌شده', cancelled: 'لغوشده' }[batch.status];
    const data = await renderChecklistPdf({
      title: 'چک‌لیست جمع‌آوری و تحویل قطعات',
      subtitle: `نوبت ${shortId} · ${state}`,
      meta: [
        `ثبت نوبت: ${jalaliStamp(new Date(batch.createdAt))} · مسئول: ${batch.createdByName}`,
        ...(batch.recipientName ? [`تحویل‌گیرنده: ${batch.recipientName}`] : []),
      ],
      layout: 'landscape',
      columns: [
        { title: '✓', width: 4 }, { title: 'ردیف', width: 5, align: 'center' }, { title: 'آدرس قفسه', width: 12, latin: true },
        { title: 'نام قطعه', width: 23 }, { title: 'کد فنی', width: 13, latin: true }, { title: 'تعداد', width: 6, align: 'center' },
        { title: 'خودرو و پلاک', width: 15 }, { title: 'پرونده / پذیرش', width: 12, latin: true }, { title: 'بخش کاری', width: 10 },
      ],
      rows: pickingBatchRows(batch),
      minRowHeight: 30, emptyText: 'این نوبت قطعه‌ای ندارد.',
      legend: 'آدرس خالی یعنی قفسهٔ ثبت‌شده‌ای برای این ردیف وجود ندارد. تحویل پس از دریافت واقعی در میز قطعات ثبت می‌شود.',
      signature: ['مسئول جمع‌آوری', 'تحویل‌گیرنده', 'تاریخ و امضا'], generatedAt: new Date(),
    });
    return { data, fileName: `picking-batch-${shortId}.pdf` };
  }
}

export function pickingBatchRows(batch: PickingBatch): ChecklistRow[] {
  const items = batch.items.flatMap((item) => (item.shelves.length ? item.shelves : [{ code: item.code, address: '', quantity: item.quantity }])
    .map((shelf) => ({ item, shelf })))
    .sort((a, b) => Number(!a.shelf.address) - Number(!b.shelf.address) || a.shelf.address.localeCompare(b.shelf.address, 'en') ||
      a.item.caseNumber.localeCompare(b.item.caseNumber) || a.item.description.localeCompare(b.item.description, 'fa'));
  return items.map(({ item, shelf }, i) => ({
    muted: batch.status !== 'pending',
    cells: ['', String(i + 1), shelf.address, item.description, shelf.code, String(shelf.quantity),
      [item.vehicle, item.plate].filter(Boolean).join('\n'), [item.caseNumber, item.admissionNo].filter(Boolean).join('\n'), item.department ?? ''],
  }));
}
