import { and, eq, gt, inArray, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  EMDAD_ARRIVED_CATEGORIES,
  EMDAD_DEALER_SUPPLY_CATEGORY,
  EMDAD_RECEIVED_QUANTITY_LABELS,
  type EmdadReceivedQuantityField,
  assessmentCodeOf,
  emdadNoKey,
  parseBasePartNumber,
  parseJalali,
  parseProcurementCode,
  parseStockCode,
  toLatinDigits,
} from '@manage/shared';
import type { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import type { DbOrTx } from '../db/database';
import { cases, emdadRequests, partRequests, stockReservations, stockSnapshotItems, vehicles } from '../db/schema';
import { caseAndBayRecipients, notifyUsers, partLink, usersWithRole } from '../parts/part-notify';
import { idKey } from '../vehicle-import/vehicle-sheet';
import type { EmdadOfficial } from './report-rows';

// Special-aid report ↔ part lines (owner instructions of 2026-11-17).
// Identifiers: «شمارهٔ امداد ویژه» (the verified column «شماره امداد ویژه»),
// VIN/chassis and the 8-digit assessment code («کد اختصاصی»); the 10-digit
// procurement code («کد تدارکاتی») chooses the manufacturer variant to reserve.
// The legacy request number is never matched on and never copied.

const baseOf = (code: string | null | undefined) => (code ? (parseStockCode(code)?.basePartNumber ?? parseBasePartNumber(code)) : null);

/** A company-source line of an open case, as seen by the matcher. */
export interface EmdadLine {
  id: string;
  caseId: string;
  caseNumber: string;
  partNumber: string | null;
  procurementCode: string | null;
  emdadNo: string | null;
  vin: string | null;
  chassisRef: string | null;
  admissionKey: string | null;
}
export type EmdadDecision =
  | { kind: 'link'; line: EmdadLine; note: string }
  | { kind: 'review'; note: string; caseId?: string | null; ambiguous?: boolean }
  | { kind: 'none' };

type ReportIds = Pick<EmdadOfficial, 'partCode' | 'initialCode' | 'fullCodeBase'> & { fullCode?: string | null; emdadNo?: string | null; chassis?: string | null };

/** The 8-digit assessment code of a report row, or null when its codes disagree or are missing. */
export function reportAssessmentCode(o: Pick<EmdadOfficial, 'partCode' | 'initialCode' | 'fullCodeBase'>): { code: string | null; contradictory: boolean } {
  const bases = new Set([o.partCode, o.initialCode, o.fullCodeBase].map((c) => baseOf(c)).filter((b): b is string => !!b));
  if (bases.size > 1) return { code: null, contradictory: true };
  return { code: [...bases][0] ?? null, contradictory: false };
}

/** A short chassis is compared with the recorded chassis, a 17-character one with the VIN. */
export function sameVehicle(chassis: string | null | undefined, l: Pick<EmdadLine, 'vin' | 'chassisRef'>): boolean {
  const k = idKey(chassis ?? '');
  if (!k) return false;
  return idKey(l.vin ?? '') === k || idKey(l.chassisRef ?? '') === k;
}

/**
 * Chooses the part line of one report row, inside the tenant, never by guessing:
 *  1. The special-aid number recorded on a line; chassis and assessment code must agree.
 *  2. Otherwise VIN/chassis + 8-digit assessment code on a line without another number.
 *  Several cases of the same VIN are told apart by the verified admission number.
 *  A recorded procurement code or special-aid number that differs is a conflict.
 */
export function decideEmdadLine(o: ReportIds, admissionKey: string | null, lines: readonly EmdadLine[]): EmdadDecision {
  const { code, contradictory } = reportAssessmentCode(o);
  if (contradictory) return { kind: 'review', note: 'کدهای قطعهٔ گزارش با هم متناقض‌اند؛ بررسی دستی لازم است' };
  const number = emdadNoKey(o.emdadNo);
  const reportFull = parseProcurementCode(o.fullCode);
  const lineCode = (l: EmdadLine) => assessmentCodeOf(l.procurementCode) ?? assessmentCodeOf(l.partNumber);
  const recordedFull = (l: EmdadLine) => parseProcurementCode(l.procurementCode) ?? parseProcurementCode(l.partNumber);
  const byAdmission = (list: EmdadLine[]) => {
    if (new Set(list.map((l) => l.caseId)).size <= 1 || !admissionKey) return list;
    return list.filter((l) => l.admissionKey === admissionKey);
  };
  const conflictOf = (l: EmdadLine): string | null => {
    const full = recordedFull(l);
    if (full && reportFull && full !== reportFull) return 'کد تدارکاتی ثبت‌شده روی قطعه با کد تدارکاتی گزارش فرق دارد';
    return null;
  };

  if (number) {
    const numbered = lines.filter((l) => emdadNoKey(l.emdadNo) === number);
    if (numbered.length) {
      const fits = byAdmission(numbered.filter((l) => (!o.chassis || sameVehicle(o.chassis, l)) && (!code || !lineCode(l) || lineCode(l) === code)));
      if (fits.length === 1) {
        const conflict = conflictOf(fits[0]!);
        if (conflict) return { kind: 'review', note: conflict, caseId: fits[0]!.caseId };
        return { kind: 'link', line: fits[0]!, note: o.chassis ? 'شمارهٔ امداد ویژه، شاسی و کد اختصاصی یکسان است' : 'شمارهٔ امداد ویژه و کد اختصاصی یکسان است' };
      }
      if (fits.length > 1) return { kind: 'review', ambiguous: true, note: 'چند قطعه با همین شمارهٔ امداد ویژه و کد اختصاصی ثبت شده است؛ دستی تطبیق دهید' };
      return { kind: 'review', note: 'شمارهٔ امداد ویژه در منیج ثبت شده ولی شاسی یا کد اختصاصی با گزارش یکسان نیست؛ دستی تطبیق دهید' };
    }
  }

  if (!code || !o.chassis) return { kind: 'none' };
  const same = lines.filter((l) => sameVehicle(o.chassis, l) && lineCode(l) === code);
  if (!same.length) return { kind: 'none' };
  const free = same.filter((l) => !l.emdadNo || !number);
  if (!free.length) return { kind: 'review', note: 'قطعهٔ این شاسی و کد اختصاصی شمارهٔ امداد ویژهٔ دیگری دارد؛ دستی بررسی کنید', caseId: same[0]!.caseId };
  const chosen = byAdmission(free);
  if (!chosen.length) return { kind: 'review', note: 'این شاسی چند پروندهٔ باز دارد و شمارهٔ پذیرش گزارش با هیچ‌کدام یکی نیست؛ دستی تطبیق دهید' };
  if (chosen.length > 1) {
    const many = new Set(chosen.map((l) => l.caseId)).size > 1;
    return { kind: 'review', ambiguous: true, note: many ? 'این شاسی چند پروندهٔ باز با همین کد اختصاصی دارد؛ دستی تطبیق دهید' : 'چند قطعه با همین شاسی و کد اختصاصی ثبت شده است؛ دستی تطبیق دهید' };
  }
  const conflict = conflictOf(chosen[0]!);
  if (conflict) return { kind: 'review', note: conflict, caseId: chosen[0]!.caseId };
  return { kind: 'link', line: chosen[0]!, note: 'شاسی و کد اختصاصی یکسان است' };
}

/** Jalali date (and optional time) of a report cell, in Tehran time; null when absent or unreadable. */
export function parseReportDate(raw: string | null | undefined): Date | null {
  const text = toLatinDigits(String(raw ?? '')).trim();
  const d = text.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (!d) return null;
  const t = text.slice((d.index ?? 0) + d[0].length).match(/(\d{1,2}):(\d{2})/);
  return parseJalali(`${d[1]}/${d[2]}/${d[3]}`, t ? `${t[1]}:${t[2]}` : '00:00');
}

/**
 * Received quantity of a report row, read ONLY from the column whose meaning the owner
 * verified (profile setting receivedQuantityField). No verified column, an empty cell or a
 * value that is not a whole positive number → null; never the case-line quantity.
 */
export function reportQuantity(o: Partial<Pick<EmdadOfficial, EmdadReceivedQuantityField>>, field: EmdadReceivedQuantityField | null): number | null {
  if (!field) return null;
  const v = toLatinDigits(String(o[field] ?? '')).trim().replace(/٫/g, '.');
  if (!/^\d+(?:\.0+)?$/.test(v)) return null;
  const n = Math.floor(Number(v));
  return Number.isSafeInteger(n) && n > 0 && n <= 999 ? n : null;
}

const qty = (v: string | number | null | undefined) => Number(v ?? 0);

/**
 * Daily Emdad Vijeh report → unified parts list (spec section 7). Runs inside
 * the publish transaction of the report (serialized per dealership and kind).
 *  1. A linked line without a special-aid number receives it from the report;
 *     a different recorded number sends the row back to review (never overwritten).
 *  2. «وارد موجودی شده» / «رسید توسط نمایندگی»: the actual warehouse receipt date
 *     and confirmed quantity are recorded, and the exact 10-digit procurement code
 *     is reserved for this vehicle (never more than confirmed and available).
 *     The line is ready for delivery only when its whole quantity is reserved.
 *  3. «تأمین توسط نمایندگی»: the parts clerks are told to price and supply it.
 */
export async function applyEmdadToParts(
  tx: DbOrTx,
  audit: AuditService,
  actor: Actor,
  importId: string,
  reportAt: Date,
  quantityField: EmdadReceivedQuantityField | null,
  reserve: (tx: DbOrTx, actor: Actor, input: { partRequestId: string; snapshotId: string; fullStockCode: string; locationAddress: string; quantity: string; confirm: true }) => Promise<string>,
  activeSnapshot: (tx: DbOrTx, tenantId: string) => Promise<{ id: string; reservable: boolean } | null>,
  caseIds?: string[],
  partIds?: string[],
) {
  const tenantId = actor.user.tenantId;
  const result = { emdadNoFilled: 0, arrived: 0, reserved: 0, partial: 0, quantityReview: 0, dealerSupply: 0, needsReview: 0 };

  // Latest linked row per line (an older file never moves a line).
  const newer = alias(emdadRequests, 'newer_emdad');
  const linked = await tx
    .select({ e: emdadRequests, partId: partRequests.id })
    .from(emdadRequests)
    .innerJoin(partRequests, eq(partRequests.id, emdadRequests.partRequestId))
    .innerJoin(cases, eq(cases.id, partRequests.caseId))
    .where(and(
      eq(emdadRequests.tenantId, tenantId),
      eq(emdadRequests.lastImportId, importId),
      eq(emdadRequests.matchStatus, 'matched'),
      eq(partRequests.tenantId, tenantId),
      eq(partRequests.source, 'company'),
      eq(cases.tenantId, tenantId),
      eq(cases.status, 'open'),
      caseIds ? inArray(cases.id, caseIds) : undefined,
      partIds ? inArray(partRequests.id, partIds) : undefined,
      notExists(tx.select({ id: newer.id }).from(newer).where(and(
        eq(newer.tenantId, tenantId),
        eq(newer.partRequestId, partRequests.id),
        eq(newer.matchStatus, 'matched'),
        sql`(${newer.statusCategory} <> 'cancelled' or ${emdadRequests.statusCategory} = 'cancelled')`,
        or(gt(newer.lastReportAt, emdadRequests.lastReportAt),
          sql`(${newer.lastReportAt} = ${emdadRequests.lastReportAt} and ${newer.id} > ${emdadRequests.id})`),
      ))),
    ))
    .orderBy(emdadRequests.id);
  const clerks = linked.some((l) => l.e.statusCategory === EMDAD_DEALER_SUPPLY_CATEGORY || (EMDAD_ARRIVED_CATEGORIES as readonly string[]).includes(l.e.statusCategory))
    ? await usersWithRole(tx, tenantId, ['parts_clerk'])
    : [];
  const snapshot = linked.length ? await activeSnapshot(tx, tenantId) : null;

  for (const { e, partId } of linked) {
    // The line is locked for the whole decision: concurrent reservations and retries see one state.
    let [p] = await tx.select().from(partRequests).where(and(eq(partRequests.id, partId), eq(partRequests.tenantId, tenantId))).for('update');
    if (!p || p.assessmentRejectedAt || ['cancelled', 'returned', 'handed_over'].includes(p.status)) continue;
    const official = (e.official ?? {}) as EmdadOfficial;
    const toReview = async (note: string) => {
      await tx.update(emdadRequests).set({ partRequestId: null, matchStatus: 'needs_review', matchNote: note, updatedAt: new Date(), version: e.version + 1 })
        .where(and(eq(emdadRequests.id, e.id), eq(emdadRequests.version, e.version)));
      result.needsReview += 1;
    };

    // 1. Special-aid number: filled once from an unambiguous match, never overwritten.
    const reportNo = official.emdadNo?.trim() || null;
    const patch: Partial<typeof partRequests.$inferInsert> = {};
    if (reportNo && p.emdadNo && emdadNoKey(p.emdadNo) !== emdadNoKey(reportNo)) {
      await toReview('شمارهٔ امداد ویژهٔ ثبت‌شده روی قطعه با گزارش فرق دارد؛ دستی بررسی کنید');
      continue;
    }
    if (reportNo && !p.emdadNo) patch.emdadNo = reportNo;

    if (p.status !== 'ordered' && p.status !== 'reserved') {
      // Already reserved or received: only the number may still be filled.
      if (patch.emdadNo) {
        await saveLine(tx, audit, actor, p, patch, 'part.emdad_no_filled', { emdadNo: patch.emdadNo, requestId: e.id });
        result.emdadNoFilled += 1;
      }
      continue;
    }

    if ((EMDAD_ARRIVED_CATEGORIES as readonly string[]).includes(e.statusCategory)) {
      // 2. Arrival. Receipt date only from the report's warehouse receipt column.
      const receivedAt = parseReportDate(official.receivedInWarehouseAt);
      const reportedQuantity = reportQuantity(official, quantityField);
      // Without a verified received quantity nothing is reserved and the line is not ready.
      const confirmed = reportedQuantity;
      // A report may authorize more than the original assessment line anticipated.
      if (confirmed != null && confirmed > p.quantity) {
        const expanded = await saveLine(tx, audit, actor, p, { quantity: confirmed }, 'part.emdad_quantity_updated', { quantity: confirmed, previousQuantity: p.quantity });
        if (!expanded) continue;
        p = expanded;
      }
      const quantityNote = confirmed != null ? null : !quantityField
        ? 'تعداد رسیده تأیید نشده است: معنای ستون تعداد در گزارش امداد ویژه هنوز تأیید نشده؛ رزرو خودکار انجام نمی‌شود و قطعه آمادهٔ تحویل نیست. تعداد را بررسی کنید.'
        : `تعداد رسیده در ستون «${EMDAD_RECEIVED_QUANTITY_LABELS[quantityField]}» این گزارش نیامده یا عدد معتبر نیست؛ رزرو خودکار انجام نشد و قطعه آمادهٔ تحویل نیست. تعداد را بررسی کنید.`;
      const reportFull = parseProcurementCode(official.fullCode);
      const assessment = assessmentCodeOf(p.procurementCode) ?? assessmentCodeOf(p.partNumber);
      const recorded = parseProcurementCode(p.procurementCode) ?? parseProcurementCode(p.partNumber);
      let code: string | null = recorded;
      let note: string | null = null;
      if (reportFull && assessment && reportFull.slice(0, 8) !== assessment) note = `۸ رقم اول کد تدارکاتی گزارش (${reportFull}) با کد اختصاصی قطعه (${assessment}) یکی نیست؛ کد درست را انتخاب کنید.`;
      else if (reportFull && recorded && reportFull !== recorded) note = `کد تدارکاتی گزارش (${reportFull}) با کد ثبت‌شدهٔ قطعه (${recorded}) فرق دارد؛ کد درست را انتخاب کنید.`;
      else code = recorded ?? reportFull;
      if (!note && code && !recorded) patch.procurementCode = code;
      const first = p.emdadReceivedQuantity == null && p.emdadReceivedAt == null && !p.emdadReserveNote;
      if (p.emdadReceivedAt?.getTime() !== receivedAt?.getTime()) patch.emdadReceivedAt = receivedAt;
      if (p.emdadReceivedQuantity !== confirmed) patch.emdadReceivedQuantity = confirmed;

      const held = (await tx.execute(sql`select coalesce(sum(quantity), 0)::text as q from stock_reservations where tenant_id = ${tenantId} and part_request_id = ${p.id} and status in ('reserved','issued')`)) as unknown as { rows: { q: string }[] };
      let reserved = qty(held.rows[0]?.q);
      let want = confirmed == null ? 0 : confirmed - reserved;
      if (quantityNote) note = note ? `${quantityNote} ${note}` : quantityNote;
      else if (!note && !code) note = 'کد تدارکاتی ۱۰ رقمی در گزارش نیامده و سازندهٔ این قطعه هنوز مشخص نیست؛ کدهای هم‌پایه را ببینید، یکی را انتخاب و رزرو کنید.';
      else if (!note && want > 0) {
        if (!snapshot) note = 'گزارش موجودی فعال ثبت نشده است؛ پس از بارگذاری گزارش موجودی، رزرو را ثبت کنید.';
        else if (!snapshot.reservable) note = 'گزارش موجودی هنوز برای رزرو تأیید نشده است؛ پس از تأیید مالک، رزرو را ثبت کنید.';
        else if (!actor.user.permissions.has('stock.reserve')) note = 'بارگذار گزارش اجازهٔ رزرو ندارد؛ مسئول قطعات کد را رزرو کند.';
        else {
          const items = await tx
            .select({ loc: stockSnapshotItems.locationAddress, quantity: stockSnapshotItems.quantity })
            .from(stockSnapshotItems)
            .where(and(eq(stockSnapshotItems.tenantId, tenantId), eq(stockSnapshotItems.snapshotId, snapshot.id), eq(stockSnapshotItems.fullStockCode, code!)))
            .orderBy(stockSnapshotItems.locationAddress);
          const commitments = items.length
            ? await tx
              .select({ loc: stockReservations.locationAddress, q: sql<string>`coalesce(sum(${stockReservations.quantity}), 0)::text` })
              .from(stockReservations)
              .where(and(eq(stockReservations.tenantId, tenantId), eq(stockReservations.fullStockCode, code!), sql`(${stockReservations.status} = 'reserved' or (${stockReservations.status} = 'issued' and ${stockReservations.reflectedAt} is null))`))
              .groupBy(stockReservations.locationAddress)
            : [];
          const used = new Map(commitments.map((c) => [c.loc, qty(c.q)]));
          for (const item of items) {
            const free = Math.floor(qty(item.quantity) - (used.get(item.loc) ?? 0));
            if (free <= 0 || want <= 0) continue;
            const take = Math.min(free, want);
            await reserve(tx, actor, { partRequestId: p.id, snapshotId: snapshot.id, fullStockCode: code!, locationAddress: item.loc, quantity: String(take), confirm: true });
            reserved += take;
            want -= take;
          }
          if (want > 0) note = `موجودی قابل رزرو کد ${code} در گزارش موجودی فعال کافی نیست؛ ${reserved} عدد رزرو شد و ${p.quantity - reserved} عدد باقی است. پس از ثبت رسید انبار در گزارش موجودی، باقی را رزرو کنید.`;
        }
      }
      if (!note && confirmed != null && confirmed < p.quantity) note = `گزارش رسید ${confirmed} از ${p.quantity} عدد را تأیید کرده است؛ ${p.quantity - reserved} عدد هنوز باقی است.`;
      const full = confirmed != null && confirmed >= p.quantity && reserved >= p.quantity;
      if (full && p.status !== 'reserved') Object.assign(patch, { status: 'reserved', reservedAt: new Date(), inStock: true });
      if (!full && p.status === 'reserved') patch.status = 'ordered';
      if ((p.emdadReserveNote ?? null) !== (full ? null : note)) patch.emdadReserveNote = full ? null : note;
      if (!Object.keys(patch).length) continue;
      if (patch.status === 'reserved' && p.salePriceRial == null) {
        const [r] = await tx.select({ price: stockReservations.unitSalePrice }).from(stockReservations).where(and(eq(stockReservations.tenantId, tenantId), eq(stockReservations.partRequestId, p.id), eq(stockReservations.status, 'reserved'))).limit(1);
        if (r?.price != null) patch.salePriceRial = Math.round(Number(r.price));
      }
      const saved = await saveLine(tx, audit, actor, p, patch, patch.status === 'reserved' ? 'part.emdad_reserved' : first ? 'part.emdad_arrived' : 'part.emdad_arrival_updated', {
        emdadStatus: official.emdadStatus ?? null,
        emdadNo: patch.emdadNo ?? p.emdadNo,
        receivedAt: receivedAt?.toISOString() ?? null,
        confirmedQuantity: confirmed,
        reservedQuantity: reserved,
        procurementCode: code,
        note: full ? null : note,
      }, reportAt);
      if (!saved) continue;
      if (patch.emdadNo) result.emdadNoFilled += 1;
      if (first) result.arrived += 1;
      if (quantityNote) result.quantityReview += 1;
      if (patch.status === 'reserved') {
        result.reserved += 1;
        const to = await caseAndBayRecipients(tx, tenantId, p.caseId);
        await notifyUsers(tx, tenantId, to, { kind: 'part_ready', title: `امداد ویژه رسید و رزرو شد: ${p.description}`, body: 'قطعه آمادهٔ تحویل به جایگاه است؛ تحویل بگیرید.', link: partLink(p.caseId, p.id), dedupeKey: `part_ready:${p.id}:${saved.version}` });
      } else if (!full) {
        result.partial += 1;
        await notifyUsers(tx, tenantId, clerks, { kind: 'emdad_arrival_action', title: `امداد ویژه رسید؛ رزرو کامل نشد — ${p.description}`, body: note ?? 'رزرو این قطعه را کامل کنید.', link: partLink(p.caseId, p.id), dedupeKey: `emdad_arrival_action:${p.id}:${note ?? ''}` });
      }
    } else {
      if (patch.emdadNo) {
        await saveLine(tx, audit, actor, p, patch, 'part.emdad_no_filled', { emdadNo: patch.emdadNo, requestId: e.id });
        result.emdadNoFilled += 1;
      }
      if (e.statusCategory === EMDAD_DEALER_SUPPLY_CATEGORY) {
        // 3. The company has no stock.
        await notifyUsers(tx, tenantId, clerks, {
          kind: 'emdad_dealer_supply',
          title: `امداد ویژه: تأمین توسط نمایندگی — ${p.description}`,
          body: 'شرکت این قطعه را ندارد. قیمت بدهید و از بازار یا موجودی تأمین کنید (پس از مجوز پرداخت‌کننده).',
          link: partLink(p.caseId, p.id),
          dedupeKey: `emdad_dealer_supply:${p.id}:${e.id}`,
        });
        result.dealerSupply += 1;
      }
    }
  }
  return result;
}

/** Optimistic update of one line with its audit and change-log rows; null when another writer won. */
async function saveLine(tx: DbOrTx, audit: AuditService, actor: Actor, p: typeof partRequests.$inferSelect, patch: Partial<typeof partRequests.$inferInsert>, action: string, after: Record<string, unknown>, occurredAt?: Date) {
  const [saved] = await tx
    .update(partRequests)
    .set({ ...patch, updatedAt: new Date(), version: p.version + 1 })
    .where(and(eq(partRequests.id, p.id), eq(partRequests.tenantId, p.tenantId), eq(partRequests.version, p.version)))
    .returning();
  if (!saved) return null;
  await audit.record(tx, actor, {
    entityType: 'part',
    entityId: p.id,
    caseId: p.caseId,
    action,
    ...(occurredAt ? { occurredAt } : {}),
    before: { status: p.status, emdadNo: p.emdadNo, procurementCode: p.procurementCode, emdadReceivedAt: p.emdadReceivedAt?.toISOString() ?? null },
    after: { description: p.description, status: saved.status, ...after },
    snapshot: { version: saved.version, row: saved },
  });
  return saved;
}

/** Loads the company-source lines of open cases for the matcher (tenant-scoped). */
export async function emdadLines(tx: DbOrTx, tenantId: string): Promise<EmdadLine[]> {
  const rows = await tx
    .select({ id: partRequests.id, caseId: partRequests.caseId, caseNumber: cases.caseNumber, partNumber: partRequests.partNumber, procurementCode: partRequests.procurementCode, emdadNo: partRequests.emdadNo, vin: vehicles.vin, chassisRef: vehicles.chassisRef, admissionKey: cases.admissionNoKey })
    .from(partRequests)
    .innerJoin(cases, and(eq(cases.id, partRequests.caseId), eq(cases.tenantId, tenantId)))
    .innerJoin(vehicles, and(eq(vehicles.id, cases.vehicleId), eq(vehicles.tenantId, tenantId)))
    // Special-aid lines, plus still-undecided lines of any source (their report status is shown; only special-aid lines are reserved).
    .where(and(eq(partRequests.tenantId, tenantId), or(and(eq(partRequests.source, 'company'), inArray(partRequests.status, ['ordered', 'received', 'reserved'])), inArray(partRequests.status, ['needed', 'rejected'])), eq(cases.status, 'open')));
  return rows;
}
