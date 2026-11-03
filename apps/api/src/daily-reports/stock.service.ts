import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  normalizePersian,
  parseDecimal,
  toLatinDigits,
  type ReservationActionInput,
  type ReservationStatus,
  type ReserveInput,
  type StockOption,
  type StockReservation,
  type StockSearchQuery,
  type StockSnapshotInfo,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, forbidden, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { cases, partRequests, stockReservations, stockSnapshotItems, stockSnapshots, users } from '../db/schema';
import { tehranDate } from './daily-time';

type Snapshot = typeof stockSnapshots.$inferSelect;
type Reservation = typeof stockReservations.$inferSelect;
const dec = (v: string | null | undefined) => (v == null ? null : (parseDecimal(v, { allowNegative: true }) ?? v));

export function snapshotInfo(s: Snapshot, now = new Date()): StockSnapshotInfo {
  return {
    id: s.id,
    reportedAt: s.reportedAt.toISOString(),
    reportedAtPrecision: s.reportedAtPrecision,
    publishedAt: s.publishedAt.toISOString(),
    itemCount: s.itemCount,
    currency: s.currency,
    taxIncluded: s.taxIncluded,
    completeness: s.completeness,
    scope: s.scope,
    quantityMeaning: s.quantityMeaning,
    fresh: tehranDate(s.reportedAt) === tehranDate(now),
    // Reserving against the report needs the owner's confirmation of what it covers.
    reservable: !!s.scope && !!s.completeness && !!s.quantityMeaning,
  };
}

@Injectable()
export class StockService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}
  private get db() {
    return this.handle.db;
  }

  async active(tx: DbOrTx, tenantId: string): Promise<Snapshot | null> {
    const [s] = await tx
      .select()
      .from(stockSnapshots)
      .where(and(eq(stockSnapshots.tenantId, tenantId), eq(stockSnapshots.status, 'active')));
    return s ?? null;
  }

  /** Manage commitments per code and location: active reservations and issues not yet in the report. */
  private commitments(tx: DbOrTx, tenantId: string) {
    return tx
      .select({
        code: stockReservations.fullStockCode,
        loc: stockReservations.locationAddress,
        reserved: sql<string>`coalesce(sum(${stockReservations.quantity}) filter (where ${stockReservations.status} = 'reserved'), 0)`.as('reserved'),
        issued: sql<string>`coalesce(sum(${stockReservations.quantity}) filter (where ${stockReservations.status} = 'issued' and ${stockReservations.reflectedAt} is null), 0)`.as('issued'),
      })
      .from(stockReservations)
      .where(and(eq(stockReservations.tenantId, tenantId), inArray(stockReservations.status, ['reserved', 'issued'])))
      .groupBy(stockReservations.fullStockCode, stockReservations.locationAddress)
      .as('c');
  }

  /**
   * Options of the active report by base code, full code or description, with
   * paging and the total count. Each code+location is its own option; the
   * same code in different locations is never summed.
   */
  async options(actor: Actor, q: StockSearchQuery): Promise<{ snapshot: StockSnapshotInfo | null; items: StockOption[]; total: number; page: number; pageSize: number }> {
    const tenantId = actor.user.tenantId;
    const snap = await this.active(this.db, tenantId);
    if (!snap) return { snapshot: null, items: [], total: 0, page: q.page, pageSize: q.pageSize };
    const conds: (SQL | undefined)[] = [eq(stockSnapshotItems.snapshotId, snap.id), eq(stockSnapshotItems.tenantId, tenantId)];
    const term = toLatinDigits(q.q).replace(/\s+/g, ' ').trim();
    const code = term.replace(/\s+/g, '').toUpperCase();
    if (q.base) conds.push(eq(stockSnapshotItems.basePartNumber, q.base));
    if (term) {
      if (/^\d{8}$/.test(code)) conds.push(or(eq(stockSnapshotItems.basePartNumber, code), ilike(stockSnapshotItems.fullStockCode, `${code}%`)));
      else if (/^[0-9A-Z]{3,}$/.test(code)) conds.push(ilike(stockSnapshotItems.fullStockCode, `%${code}%`));
      else {
        // Report text uses Arabic ي/ك; compare in Persian form.
        const words = normalizePersian(term).split(' ').filter(Boolean).slice(0, 5);
        for (const w of words) conds.push(sql`translate(coalesce(${stockSnapshotItems.description}, ''), 'يكة', 'یکه') ilike ${`%${w}%`}`);
      }
    }
    const where = and(...conds);
    const [{ total }] = (await this.db.select({ total: sql<number>`count(*)::int` }).from(stockSnapshotItems).where(where)) as [{ total: number }];
    const c = this.commitments(this.db, tenantId);
    const rows = await this.db
      .select({ i: stockSnapshotItems, reserved: sql<string>`coalesce(${c.reserved}, 0)`, issued: sql<string>`coalesce(${c.issued}, 0)` })
      .from(stockSnapshotItems)
      .leftJoin(c, and(eq(c.code, stockSnapshotItems.fullStockCode), eq(c.loc, stockSnapshotItems.locationAddress)))
      .where(where)
      .orderBy(asc(stockSnapshotItems.basePartNumber), asc(stockSnapshotItems.fullStockCode), asc(stockSnapshotItems.locationAddress))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const avail = await this.available(
      this.db,
      rows.map((r) => ({ quantity: r.i.quantity, reserved: r.reserved, issued: r.issued })),
    );
    return {
      snapshot: snapshotInfo(snap),
      items: rows.map(({ i, reserved, issued }, n) => ({
        fullStockCode: i.fullStockCode,
        rawCode: i.rawCode,
        basePartNumber: i.basePartNumber,
        supplySuffix: i.supplySuffix,
        codeKind: i.codeKind as StockOption['codeKind'],
        description: i.description,
        unit: i.unit,
        vehicleModel: i.vehicleModel,
        locationAddress: i.locationAddress,
        locationText: i.locationText,
        reported: dec(i.quantity)!,
        reserved: dec(reserved)!,
        issuedUnreflected: dec(issued)!,
        available: avail[n]!,
        salePrice: dec(i.salePrice),
        avgPrice: dec(i.avgPrice),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** Exact decimal subtraction in the database (no float). */
  private async available(tx: DbOrTx, rows: { quantity: string; reserved: string; issued: string }[]): Promise<string[]> {
    if (!rows.length) return [];
    const values = sql.join(
      rows.map((r, n) => sql`(${n}::int, ${r.quantity}::numeric, ${r.reserved}::numeric, ${r.issued}::numeric)`),
      sql`, `,
    );
    const result = (await tx.execute(sql`select n, (q - r - i)::text as a from (values ${values}) as v(n, q, r, i) order by n`)) as unknown as { rows: { a: string }[] };
    return result.rows.map((r) => dec(r.a)!);
  }

  private needPermission(actor: Actor, p: 'stock.read' | 'stock.reserve' | 'stock.release' | 'stock.issue') {
    if (!actor.user.permissions.has(p)) throw forbidden();
  }

  async reserve(actor: Actor, input: ReserveInput): Promise<StockReservation> {
    this.needPermission(actor, 'stock.reserve');
    const tenantId = actor.user.tenantId;
    const id = newId();
    await this.db.transaction(async (tx) => {
      const [need] = await tx
        .select()
        .from(partRequests)
        .where(and(eq(partRequests.id, input.partRequestId), eq(partRequests.tenantId, tenantId)))
        .for('update');
      if (!need) throw notFound('نیاز قطعه');
      if (['cancelled', 'handed_over'].includes(need.status)) throw badRequest('PART_NOT_OPEN', 'این نیاز قطعه لغو یا تحویل شده است');
      const [kase] = await tx.select({ id: cases.id, stage: cases.stage, status: cases.status }).from(cases).where(and(eq(cases.id, need.caseId), eq(cases.tenantId, tenantId)));
      if (!kase || kase.stage === 'delivered' || kase.status !== 'open') throw badRequest('CASE_NOT_OPEN', 'پرونده باز نیست؛ رزرو ثبت نشد');
      // Serializes every reservation of the same code and location, across requests and workers.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`stock:${tenantId}:${input.fullStockCode}:${input.locationAddress}`}))`);
      const snap = await this.active(tx, tenantId);
      if (!snap) throw badRequest('NO_STOCK_REPORT', 'گزارش موجودی ثبت نشده است');
      if (snap.id !== input.snapshotId) throw conflict('STOCK_REPORT_CHANGED', 'گزارش موجودی تازه‌تری ثبت شده است؛ گزینه‌ها را دوباره ببینید و انتخاب کنید');
      if (!snapshotInfo(snap).reservable) throw badRequest('STOCK_NOT_CONFIRMED', 'دامنه انبار، کامل‌بودن گزارش و معنای ستون موجودی هنوز توسط مالک تأیید نشده است؛ رزرو فعال نیست');
      const [item] = await tx
        .select()
        .from(stockSnapshotItems)
        .where(and(eq(stockSnapshotItems.snapshotId, snap.id), eq(stockSnapshotItems.fullStockCode, input.fullStockCode), eq(stockSnapshotItems.locationAddress, input.locationAddress)));
      if (!item) throw notFound('این کد کامل در این محل در گزارش فعال');
      const sums = (await tx.execute(sql`
        select
          (${need.quantity}::numeric - coalesce((select sum(quantity) from stock_reservations where part_request_id = ${need.id} and status in ('reserved','issued')), 0))::text as need_left,
          (${item.quantity}::numeric - coalesce((select sum(quantity) from stock_reservations where tenant_id = ${tenantId} and full_stock_code = ${item.fullStockCode} and location_address = ${item.locationAddress} and (status = 'reserved' or (status = 'issued' and reflected_at is null))), 0))::text as stock_left,
          (${input.quantity}::numeric > ${need.quantity}::numeric - coalesce((select sum(quantity) from stock_reservations where part_request_id = ${need.id} and status in ('reserved','issued')), 0)) as over_need,
          (${input.quantity}::numeric > ${item.quantity}::numeric - coalesce((select sum(quantity) from stock_reservations where tenant_id = ${tenantId} and full_stock_code = ${item.fullStockCode} and location_address = ${item.locationAddress} and (status = 'reserved' or (status = 'issued' and reflected_at is null))), 0)) as over_stock
      `)) as unknown as { rows: { need_left: string; stock_left: string; over_need: boolean; over_stock: boolean }[] };
      const s = sums.rows[0]!;
      if (s.over_need) throw badRequest('OVER_NEED', `مقدار بیشتر از باقی‌مانده نیاز است (باقی‌مانده: ${dec(s.need_left)})`, { needLeft: dec(s.need_left) });
      if (s.over_stock) throw conflict('INSUFFICIENT_STOCK', `موجودی قابل رزرو کافی نیست (قابل رزرو: ${dec(s.stock_left)})`, { available: dec(s.stock_left) });
      await tx.insert(stockReservations).values({
        id,
        tenantId,
        caseId: need.caseId,
        partRequestId: need.id,
        fullStockCode: item.fullStockCode,
        locationAddress: item.locationAddress,
        quantity: input.quantity,
        snapshotId: snap.id,
        unitSalePrice: item.salePrice,
        unitAvgPrice: item.avgPrice,
        currency: snap.currency,
        reservedBy: actor.user.id,
        isTest: actor.user.isTestTenant,
      });
      await this.audit.record(tx, actor, {
        entityType: 'part',
        entityId: need.id,
        caseId: need.caseId,
        action: 'stock.reserved',
        after: { reservationId: id, fullStockCode: item.fullStockCode, locationAddress: item.locationAddress, quantity: input.quantity, snapshotId: snap.id, unitSalePrice: item.salePrice, currency: snap.currency },
        snapshot: { version: 1, row: { id, partRequestId: need.id, fullStockCode: item.fullStockCode, quantity: input.quantity, status: 'reserved' } },
      });
    });
    return (await this.reservations(actor, { ids: [id] }))[0]!;
  }

  async act(actor: Actor, id: string, input: ReservationActionInput): Promise<StockReservation> {
    this.needPermission(actor, input.action === 'release' || input.action === 'cancel' ? 'stock.release' : 'stock.issue');
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      const [r] = await tx
        .select()
        .from(stockReservations)
        .where(and(eq(stockReservations.id, id), eq(stockReservations.tenantId, tenantId)))
        .for('update');
      if (!r) throw notFound('رزرو');
      if (r.version !== input.expectedVersion) throw versionConflict(r.version);
      const now = new Date();
      const invalid = () => conflict('INVALID_RESERVATION_STEP', 'این اقدام در وضعیت فعلی رزرو ممکن نیست');
      let patch: Partial<Reservation>;
      switch (input.action) {
        case 'issue':
          if (r.status !== 'reserved') throw invalid();
          patch = { status: 'issued', issuedAt: now, issuedBy: actor.user.id };
          break;
        case 'release':
          if (r.status !== 'reserved') throw invalid();
          patch = { status: 'released', closedAt: now, closedBy: actor.user.id, reason: input.reason! };
          break;
        case 'cancel':
          // Undoes an issue recorded by mistake, only before the report reflects it.
          if (r.status !== 'issued' || r.reflectedAt) throw invalid();
          patch = { status: 'cancelled', closedAt: now, closedBy: actor.user.id, reason: input.reason! };
          break;
        case 'reflect': {
          if (r.status !== 'issued' || r.reflectedAt) throw invalid();
          const snap = await this.active(tx, tenantId);
          // Only a report taken after the issue can contain it.
          if (!snap || !r.issuedAt || snap.reportedAt.getTime() <= r.issuedAt.getTime()) {
            throw badRequest('REPORT_BEFORE_ISSUE', 'گزارش فعال قبل از خروج تهیه شده است؛ پس از ورود گزارش بعدی تأیید کنید');
          }
          patch = { reflectedAt: now, reflectedBy: actor.user.id, reflectedSnapshotId: snap.id, reason: input.reason ?? r.reason };
          break;
        }
      }
      const [row] = await tx
        .update(stockReservations)
        .set({ ...patch, updatedAt: now, version: r.version + 1 })
        .where(and(eq(stockReservations.id, id), eq(stockReservations.version, r.version)))
        .returning();
      if (!row) throw versionConflict();
      await this.audit.record(tx, actor, {
        entityType: 'part',
        entityId: r.partRequestId,
        caseId: r.caseId,
        action: `stock.${input.action === 'reflect' ? 'reflected' : input.action === 'issue' ? 'issued' : input.action === 'release' ? 'released' : 'issue_cancelled'}`,
        reason: input.reason ?? null,
        before: { reservationId: id, status: r.status, reflectedAt: r.reflectedAt?.toISOString() ?? null },
        after: { reservationId: id, status: row.status, reflectedAt: row.reflectedAt?.toISOString() ?? null },
        snapshot: { version: row.version, row: { id, status: row.status } },
      });
    });
    return (await this.reservations(actor, { ids: [id] }))[0]!;
  }

  async reservations(
    actor: Actor,
    f: { ids?: string[]; caseId?: string; partRequestId?: string; status?: ReservationStatus; reconcile?: boolean; page?: number; pageSize?: number },
  ): Promise<StockReservation[]> {
    const tenantId = actor.user.tenantId;
    const conds: (SQL | undefined)[] = [eq(stockReservations.tenantId, tenantId)];
    if (f.ids) conds.push(inArray(stockReservations.id, f.ids));
    if (f.caseId) conds.push(eq(stockReservations.caseId, f.caseId));
    if (f.partRequestId) conds.push(eq(stockReservations.partRequestId, f.partRequestId));
    if (f.status) conds.push(eq(stockReservations.status, f.status));
    if (f.reconcile) conds.push(eq(stockReservations.status, 'issued'), isNull(stockReservations.reflectedAt));
    const snap = await this.active(this.db, tenantId);
    const rows = await this.db
      .select({ r: stockReservations, caseNumber: cases.caseNumber, admissionNo: cases.admissionNo, need: partRequests, reservedByName: users.displayName })
      .from(stockReservations)
      .innerJoin(cases, eq(cases.id, stockReservations.caseId))
      .innerJoin(partRequests, eq(partRequests.id, stockReservations.partRequestId))
      .leftJoin(users, eq(users.id, stockReservations.reservedBy))
      .where(and(...conds))
      .orderBy(desc(stockReservations.reservedAt))
      .limit(f.pageSize ?? 200)
      .offset(((f.page ?? 1) - 1) * (f.pageSize ?? 200));
    const short = await this.shortfallKeys(tenantId, snap);
    return rows.map(({ r, caseNumber, admissionNo, need, reservedByName }) => ({
      id: r.id,
      caseId: r.caseId,
      caseNumber,
      admissionNo,
      partRequestId: r.partRequestId,
      partDescription: need.description,
      partNumber: need.partNumber,
      needQuantity: need.quantity,
      fullStockCode: r.fullStockCode,
      locationAddress: r.locationAddress,
      quantity: dec(r.quantity)!,
      status: r.status as ReservationStatus,
      snapshotId: r.snapshotId,
      unitSalePrice: dec(r.unitSalePrice),
      unitAvgPrice: dec(r.unitAvgPrice),
      currency: r.currency,
      reservedByName,
      reservedAt: r.reservedAt.toISOString(),
      issuedAt: r.issuedAt?.toISOString() ?? null,
      closedAt: r.closedAt?.toISOString() ?? null,
      reason: r.reason,
      reflectedAt: r.reflectedAt?.toISOString() ?? null,
      shortfall: (r.status === 'reserved' || (r.status === 'issued' && !r.reflectedAt)) && short.has(`${r.fullStockCode}@${r.locationAddress}`),
      version: r.version,
    }));
  }

  /** Code+locations where Manage commitments exceed the newest report (reservations are kept, only flagged). */
  async shortfallKeys(tenantId: string, snap: Snapshot | null): Promise<Set<string>> {
    const result = (await this.db.execute(sql`
      select c.full_stock_code as code, c.location_address as loc
      from (
        select full_stock_code, location_address, sum(quantity) as committed
        from stock_reservations
        where tenant_id = ${tenantId} and (status = 'reserved' or (status = 'issued' and reflected_at is null))
        group by 1, 2
      ) c
      left join stock_snapshot_items i on i.snapshot_id = ${snap?.id ?? null} and i.full_stock_code = c.full_stock_code and i.location_address = c.location_address
      where coalesce(i.quantity, 0) < c.committed
    `)) as unknown as { rows: { code: string; loc: string }[] };
    return new Set(result.rows.map((r) => `${r.code}@${r.loc}`));
  }
}
