import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { searchKey, type CaseDeleteInput, type CaseRestoreInput, type DeletedCase } from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { conflict, forbidden, notFound, versionConflict } from '../common/errors';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { cases, partRequests, stockReservations, users, vehicles } from '../db/schema';
import { StockService } from '../daily-reports/stock.service';
import { CasesService } from './cases.service';

const deletedByUser = alias(users, 'case_deleted_by');

/**
 * Owner-only recoverable deletion of a vehicle case (owner, 2026-11-18). Nothing is
 * physically deleted: the case gets status 'deleted' (its previous status is kept),
 * which removes it from every list, desk, search and current figure that reads open
 * or listed cases. Its open stock reservations are released so they stop holding
 * usable stock; issues, shared stock rows, import batches and history stay as they
 * are. Restoring brings the case back without creating any reservation or movement.
 */
@Injectable()
export class CaseDeletionService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly caseService: CasesService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  /** Server-side check against the stored account, never the session flag alone. */
  private async assertOwner(tx: DbOrTx, actor: Actor) {
    const [u] = await tx.select({ isOwner: users.isOwner, isActive: users.isActive }).from(users).where(and(eq(users.id, actor.user.id), eq(users.tenantId, actor.user.tenantId)));
    if (!actor.user.isOwner || !u?.isOwner || !u.isActive) throw forbidden('حذف و بازیابی پرونده فقط برای مالک سامانه مجاز است');
  }

  async remove(actor: Actor, id: string, input: CaseDeleteInput) {
    const tenantId = actor.user.tenantId;
    return this.db.transaction(async (tx) => {
      await this.assertOwner(tx, actor);
      const [c] = await tx.select().from(cases).where(and(eq(cases.id, id), eq(cases.tenantId, tenantId))).for('update');
      if (!c) throw notFound('پرونده');
      if (c.status === 'deleted') throw conflict('CASE_ALREADY_DELETED', 'این پرونده قبلاً حذف شده است');
      if (c.version !== input.expectedVersion) throw versionConflict(c.version);
      const now = new Date();
      const reason = `حذف پرونده توسط مالک: ${input.reason}`;
      // Open reservations stop holding usable stock; issued (physically handed over) rows are kept as they are.
      const open = await tx.select().from(stockReservations).where(and(eq(stockReservations.tenantId, tenantId), eq(stockReservations.caseId, id), eq(stockReservations.status, 'reserved')));
      for (const r of open) await this.stock.actIn(tx, actor, r.id, { action: 'release', expectedVersion: r.version, reason });
      const lines = await tx.select().from(partRequests).where(and(eq(partRequests.tenantId, tenantId), eq(partRequests.caseId, id), inArray(partRequests.status, ['reserved', 'ordered'])));
      const released: string[] = [];
      for (const p of lines) {
        if (p.status === 'ordered' && !p.stockParallelAt) continue;
        if (p.status === 'reserved' && !open.some((r) => r.partRequestId === p.id)) continue;
        const patch = p.status === 'reserved'
          ? p.source === 'company' ? { status: 'ordered', reservedAt: null, inStock: null, stockParallelAt: null, stockParallelBy: null, autoReserveBlockedAt: now } : { status: 'needed', reservedAt: null, inStock: null }
          : { stockParallelAt: null, stockParallelBy: null };
        const [saved] = await tx.update(partRequests).set({ ...patch, updatedAt: now, version: p.version + 1 }).where(and(eq(partRequests.id, p.id), eq(partRequests.version, p.version))).returning();
        if (!saved) throw versionConflict();
        released.push(p.id);
        await this.audit.record(tx, actor, { entityType: 'part', entityId: p.id, caseId: id, action: 'part.reservation_released', reason, before: { status: p.status }, after: { description: p.description, ...patch }, snapshot: { version: saved.version, row: saved } });
      }
      const [row] = await tx.update(cases).set({ status: 'deleted', deletedFromStatus: c.status, deletedAt: now, deletedBy: actor.user.id, deleteReason: input.reason, updatedAt: now, updatedBy: actor.user.id, version: c.version + 1 })
        .where(and(eq(cases.id, id), eq(cases.version, c.version))).returning();
      if (!row) throw versionConflict();
      await this.audit.record(tx, actor, { entityType: 'case', entityId: id, caseId: id, action: 'case.deleted', reason: input.reason, before: { status: c.status }, after: { status: 'deleted', caseNumber: c.caseNumber, releasedReservations: open.map((r) => r.id), releasedParts: released }, snapshot: { version: row.version, row } });
      return { id, status: 'deleted' as const, version: row.version, releasedReservations: open.length };
    });
  }

  async restore(actor: Actor, id: string, input: CaseRestoreInput) {
    const tenantId = actor.user.tenantId;
    return this.db.transaction(async (tx) => {
      await this.assertOwner(tx, actor);
      await this.caseService.lockVehicleIdentity(tx,tenantId);
      const [c] = await tx.select().from(cases).where(and(eq(cases.id, id), eq(cases.tenantId, tenantId))).for('update');
      if (!c) throw notFound('پرونده');
      if (c.status !== 'deleted') throw conflict('CASE_NOT_DELETED', 'این پرونده حذف نشده است');
      if (c.version !== input.expectedVersion) throw versionConflict(c.version);
      const status = c.deletedFromStatus && c.deletedFromStatus !== 'deleted' ? c.deletedFromStatus : 'open';
      if(status==='open') {
        const [vehicle]=await tx.select().from(vehicles).where(and(eq(vehicles.id,c.vehicleId),eq(vehicles.tenantId,tenantId)));
        await this.caseService.assertVehicleAvailable(tx,actor,[vehicle?.vin,vehicle?.chassisRef],id);
      }
      const now = new Date();
      // No reservation or stock movement is created; released reservations stay released and are decided again.
      const [row] = await tx.update(cases).set({ status, deletedFromStatus: null, deletedAt: null, deletedBy: null, deleteReason: null, updatedAt: now, updatedBy: actor.user.id, version: c.version + 1 })
        .where(and(eq(cases.id, id), eq(cases.version, c.version))).returning();
      if (!row) throw versionConflict();
      await this.audit.record(tx, actor, { entityType: 'case', entityId: id, caseId: id, action: 'case.restored', before: { status: 'deleted', deletedAt: c.deletedAt?.toISOString() ?? null, deleteReason: c.deleteReason }, after: { status, caseNumber: c.caseNumber }, snapshot: { version: row.version, row } });
      return { id, status, version: row.version };
    });
  }

  async list(actor: Actor, q?: string): Promise<DeletedCase[]> {
    await this.assertOwner(this.db, actor);
    const key = q ? searchKey(q).replace(/[%_\\]/g, '\\$&') : '';
    const rows = await this.db
      .select({ c: cases, v: vehicles, by: deletedByUser.displayName })
      .from(cases)
      .innerJoin(vehicles, eq(vehicles.id, cases.vehicleId))
      .leftJoin(deletedByUser, eq(deletedByUser.id, cases.deletedBy))
      .where(and(eq(cases.tenantId, actor.user.tenantId), eq(cases.status, 'deleted'), key ? like(cases.searchText, `%${key}%`) : sql`true`))
      .orderBy(desc(cases.deletedAt))
      .limit(200);
    return rows.map(({ c, v, by }) => ({
      id: c.id, caseNumber: c.caseNumber, admissionNo: c.admissionNo, plate: v.plate, vehicle: [v.brand, v.model, v.trim].filter(Boolean).join(' ') || 'خودرو',
      deletedAt: (c.deletedAt ?? c.updatedAt).toISOString(), deletedBy: c.deletedBy ? { id: c.deletedBy, displayName: by ?? '' } : null,
      reason: c.deleteReason, previousStatus: c.deletedFromStatus ?? 'open', version: c.version,
    }));
  }
}
