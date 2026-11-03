import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import {
  parseBasePartNumber,
  parseStockCode,
  type EmdadFollowUpInput,
  type EmdadMatchInput,
  type EmdadMatchStatus,
  type EmdadRequest,
  type EmdadSearchInput,
  type EmdadStatusCategory,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { AuditService, diff } from '../audit/audit.service';
import { badRequest, forbidden, notFound, versionConflict } from '../common/errors';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { cases, dailyReportImports, emdadRequestEvents, emdadRequests, partRequests, users, vehicles } from '../db/schema';
import { idKey, isNonUniqueAdmission } from '../vehicle-import/vehicle-sheet';
import { writeSheet } from '../parts/xlsx';
import type { EmdadOfficial } from './report-rows';
import { safeCell } from './safe-cell';

type Row = typeof emdadRequests.$inferSelect;
export interface MatchResult {
  caseId: string | null;
  partRequestId: string | null;
  matchStatus: EmdadMatchStatus;
  matchNote: string;
}

/** Categories after which there is nothing more to chase at the company. */
export const SETTLED_CATEGORIES: EmdadStatusCategory[] = ['cancelled', 'in_dealer_stock', 'received_by_dealer', 'supplied_by_dealer'];

const admissionKeyOf = (raw: string | null | undefined) => (!raw || isNonUniqueAdmission(raw) ? null : idKey(raw) || null);

/**
 * The base code is confirmed only when the 8-digit part code agrees with the
 * initial code and with the base of the full supply code (when present).
 */
export function confirmedBase(o: Pick<EmdadOfficial, 'partCode' | 'initialCode' | 'fullCodeBase'>): string | null {
  const part = parseBasePartNumber(o.partCode);
  if (!part) return null;
  const initial = parseBasePartNumber(o.initialCode);
  if (initial && initial !== part) return null;
  if (o.fullCodeBase && o.fullCodeBase !== part) return null;
  return part;
}

/** Rule-based next step with its reason; never an automatic action. */
export function emdadSuggestion(r: { statusCategory: string; caseId: string | null; partRequestId: string | null; matchStatus: string; official: Record<string, unknown> }): string | null {
  const notes = (r.official.codeNotes as string[] | undefined) ?? [];
  if (r.matchStatus === 'ambiguous' || r.matchStatus === 'needs_review') return 'اتصال به پرونده را بررسی و دستی تأیید کنید؛ سامانه اولین نتیجه را انتخاب نمی‌کند';
  if (r.statusCategory === 'needs_interpretation') return 'متن وضعیت جدید است؛ معنای آن را با شرکت روشن کنید';
  if (r.statusCategory === 'in_dealer_stock' && r.caseId) return 'طبق گزارش، قطعه وارد موجودی شده است؛ رسید فیزیکی و رزرو برای این پرونده را بررسی کنید';
  if (r.statusCategory === 'ready_to_collect') return 'طبق گزارش، قطعه آماده جمع‌آوری است؛ هماهنگی دریافت را پیگیری کنید';
  if (r.statusCategory === 'cancelled' && r.partRequestId) return 'درخواست در شرکت ابطال شده؛ وضعیت نیاز قطعه پرونده را بررسی کنید';
  if (notes.length) return 'کدهای این ردیف با هم یکسان نیستند؛ پیش از رزرو یا سفارش، کد درست را تأیید کنید';
  if (r.matchStatus === 'unmatched') return null;
  return null;
}

@Injectable()
export class EmdadService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}
  private get db() {
    return this.handle.db;
  }

  /**
   * Prepares exact matching for many report rows at once: tenant + valid
   * admission number + exact chassis, then the confirmed base code for the
   * part need. Names, row numbers or text similarity are never used.
   */
  async matcher(tx: DbOrTx, tenantId: string, officials: Pick<EmdadOfficial, 'admissionNo' | 'chassis' | 'partCode' | 'initialCode' | 'fullCodeBase'>[]) {
    const keys = [...new Set(officials.map((o) => admissionKeyOf(o.admissionNo)).filter((k): k is string => !!k))];
    const found: { id: string; caseNumber: string; admissionNoKey: string | null; vin: string | null; chassisRef: string | null }[] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      found.push(
        ...(await tx
          .select({ id: cases.id, caseNumber: cases.caseNumber, admissionNoKey: cases.admissionNoKey, vin: vehicles.vin, chassisRef: vehicles.chassisRef })
          .from(cases)
          .innerJoin(vehicles, eq(vehicles.id, cases.vehicleId))
          .where(and(eq(cases.tenantId, tenantId), inArray(cases.admissionNoKey, keys.slice(i, i + 1000))))),
      );
    }
    const byAdmission = new Map<string, typeof found>();
    for (const c of found) byAdmission.set(c.admissionNoKey!, [...(byAdmission.get(c.admissionNoKey!) ?? []), c]);
    const caseIds = found.map((c) => c.id);
    const parts: { id: string; caseId: string; partNumber: string | null }[] = [];
    for (let i = 0; i < caseIds.length; i += 1000) {
      parts.push(
        ...(await tx
          .select({ id: partRequests.id, caseId: partRequests.caseId, partNumber: partRequests.partNumber })
          .from(partRequests)
          .where(and(eq(partRequests.tenantId, tenantId), inArray(partRequests.caseId, caseIds.slice(i, i + 1000)), ne(partRequests.status, 'cancelled')))),
      );
    }
    const partBase = (n: string | null) => (n ? (parseStockCode(n)?.basePartNumber ?? parseBasePartNumber(n)) : null);

    return (o: Pick<EmdadOfficial, 'admissionNo' | 'chassis' | 'partCode' | 'initialCode' | 'fullCodeBase'>): MatchResult => {
      const none = (matchStatus: EmdadMatchStatus, matchNote: string, caseId: string | null = null): MatchResult => ({ caseId, partRequestId: null, matchStatus, matchNote });
      const adm = admissionKeyOf(o.admissionNo);
      if (!adm) return none('unmatched', 'شماره پذیرش معتبر ندارد (مثلاً «برگشتی» یا خالی)؛ اتصال خودکار انجام نشد');
      const candidates = byAdmission.get(adm) ?? [];
      if (!candidates.length) return none('unmatched', 'پرونده‌ای با این شماره پذیرش در منیج نیست؛ پرونده‌ای ساخته نشد');
      const chassis = idKey(o.chassis ?? '');
      // A short chassis number is compared with the recorded chassis, never with a VIN.
      const vehicleChassis = (c: (typeof found)[number]) => (chassis.length === 17 ? idKey(c.vin ?? '') : idKey(c.chassisRef ?? ''));
      const exact = chassis ? candidates.filter((c) => vehicleChassis(c) === chassis) : [];
      const list = candidates.map((c) => c.caseNumber).join('، ');
      if (exact.length > 1) return none('ambiguous', `چند پرونده با همین پذیرش و شاسی: ${list}`);
      if (!exact.length) {
        const unknown = candidates.some((c) => !vehicleChassis(c));
        return none('needs_review', unknown ? `پذیرش در پرونده(های) ${list} هست ولی شاسی پرونده ثبت نشده است` : `پذیرش در پرونده(های) ${list} هست ولی شاسی با گزارش یکسان نیست`);
      }
      const kase = exact[0]!;
      const base = confirmedBase(o);
      if (!base) return { caseId: kase.id, partRequestId: null, matchStatus: 'matched', matchNote: 'متصل به پرونده؛ کدها یکسان نیستند، پس اتصال به نیاز قطعه دستی است' };
      const needs = parts.filter((p) => p.caseId === kase.id && partBase(p.partNumber) === base);
      if (needs.length === 1) return { caseId: kase.id, partRequestId: needs[0]!.id, matchStatus: 'matched', matchNote: 'پذیرش، شاسی و کد پایه یکسان است' };
      if (needs.length > 1) return { caseId: kase.id, partRequestId: null, matchStatus: 'needs_review', matchNote: 'چند نیاز قطعه با همین کد پایه در پرونده هست؛ یکی را دستی انتخاب کنید' };
      return { caseId: kase.id, partRequestId: null, matchStatus: 'matched', matchNote: 'متصل به پرونده؛ نیاز قطعه‌ای با این کد پایه ثبت نشده است' };
    };
  }

  private where(actor: Actor, q: EmdadSearchInput): SQL {
    const tenantId = actor.user.tenantId;
    const conds: (SQL | undefined)[] = [eq(emdadRequests.tenantId, tenantId)];
    if (q.q) {
      const k = idKey(q.q);
      const like = `%${k}%`;
      conds.push(
        or(
          ilike(emdadRequests.admissionNo, like),
          ilike(emdadRequests.chassis, like),
          ilike(emdadRequests.emdadNo, like),
          ilike(emdadRequests.requestNo, like),
          ilike(emdadRequests.initialCode, like),
          sql`${emdadRequests.official}->>'fullCode' ilike ${like}`,
          sql`${emdadRequests.official}->>'partCode' ilike ${like}`,
          eq(cases.caseNumber, q.q.trim()),
        ),
      );
    }
    if (q.status) conds.push(eq(emdadRequests.statusCategory, q.status));
    if (q.match) conds.push(eq(emdadRequests.matchStatus, q.match));
    if (q.assignee === 'me') conds.push(eq(emdadRequests.assigneeUserId, actor.user.id));
    else if (q.assignee === 'none') conds.push(isNull(emdadRequests.assigneeUserId));
    else if (q.assignee) conds.push(eq(emdadRequests.assigneeUserId, q.assignee));
    if (q.caseId) conds.push(eq(emdadRequests.caseId, q.caseId));
    if (q.openOnly) conds.push(notInArray(emdadRequests.statusCategory, SETTLED_CATEGORIES), sql`coalesce(${emdadRequests.official}->>'releasedAt','') = ''`);
    if (q.codeIssue) conds.push(sql`jsonb_array_length(coalesce(${emdadRequests.official}->'codeNotes','[]'::jsonb)) > 0`);
    return and(...conds)!;
  }

  async search(actor: Actor, q: EmdadSearchInput): Promise<{ items: EmdadRequest[]; total: number; page: number; pageSize: number }> {
    const where = this.where(actor, q);
    const [{ total }] = (await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(emdadRequests)
      .leftJoin(cases, eq(cases.id, emdadRequests.caseId))
      .where(where)) as [{ total: number }];
    const rows = await this.db
      .select({ r: emdadRequests, caseNumber: cases.caseNumber, caseStatus: cases.status, assigneeName: users.displayName })
      .from(emdadRequests)
      .leftJoin(cases, eq(cases.id, emdadRequests.caseId))
      .leftJoin(users, eq(users.id, emdadRequests.assigneeUserId))
      .where(where)
      .orderBy(sql`${emdadRequests.dueAt} asc nulls last`, desc(emdadRequests.lastReportAt), asc(emdadRequests.externalKey))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return { items: rows.map((x) => this.toDto(x.r, x.caseNumber, x.caseStatus, x.assigneeName)), total, page: q.page, pageSize: q.pageSize };
  }

  private toDto(r: Row, caseNumber: string | null, caseStatus: string | null, assigneeName: string | null): EmdadRequest {
    const official = r.official as Record<string, string | string[] | null>;
    return {
      id: r.id,
      admissionNo: r.admissionNo,
      chassis: r.chassis,
      emdadNo: r.emdadNo,
      requestNo: r.requestNo,
      initialCode: r.initialCode,
      official,
      statusCategory: r.statusCategory as EmdadStatusCategory,
      lastReportAt: r.lastReportAt.toISOString(),
      caseId: r.caseId,
      caseNumber,
      caseClosed: caseStatus !== null && caseStatus !== 'open',
      partRequestId: r.partRequestId,
      matchStatus: r.matchStatus as EmdadMatchStatus,
      matchSource: r.matchSource,
      matchNote: r.matchNote,
      assigneeUserId: r.assigneeUserId,
      assigneeName,
      dueAt: r.dueAt?.toISOString() ?? null,
      note: r.note,
      nextAction: r.nextAction,
      suggestion: emdadSuggestion({ ...r, official }),
      version: r.version,
    };
  }

  async get(actor: Actor, id: string) {
    const [x] = await this.db
      .select({ r: emdadRequests, caseNumber: cases.caseNumber, caseStatus: cases.status, assigneeName: users.displayName })
      .from(emdadRequests)
      .leftJoin(cases, eq(cases.id, emdadRequests.caseId))
      .leftJoin(users, eq(users.id, emdadRequests.assigneeUserId))
      .where(and(eq(emdadRequests.id, id), eq(emdadRequests.tenantId, actor.user.tenantId)));
    if (!x) throw notFound('درخواست امداد ویژه');
    const events = await this.db
      .select({ id: emdadRequestEvents.id, reportAt: emdadRequestEvents.reportAt, changes: emdadRequestEvents.changes, fileName: dailyReportImports.fileName, createdAt: emdadRequestEvents.createdAt })
      .from(emdadRequestEvents)
      .innerJoin(dailyReportImports, eq(dailyReportImports.id, emdadRequestEvents.importId))
      .where(and(eq(emdadRequestEvents.requestId, id), eq(emdadRequestEvents.tenantId, actor.user.tenantId)))
      .orderBy(desc(emdadRequestEvents.reportAt))
      .limit(100);
    return { request: this.toDto(x.r, x.caseNumber, x.caseStatus, x.assigneeName), events: events.map((e) => ({ ...e, reportAt: e.reportAt.toISOString(), createdAt: e.createdAt.toISOString() })) };
  }

  private async loadForWrite(tx: DbOrTx, actor: Actor, id: string, expectedVersion: number) {
    const [r] = await tx
      .select()
      .from(emdadRequests)
      .where(and(eq(emdadRequests.id, id), eq(emdadRequests.tenantId, actor.user.tenantId)))
      .for('update');
    if (!r) throw notFound('درخواست امداد ویژه');
    if (r.version !== expectedVersion) throw versionConflict(r.version);
    return r;
  }

  /** Internal follow-up (assignee, due date, note, next action); imports never overwrite these. */
  async followUp(actor: Actor, id: string, input: EmdadFollowUpInput) {
    await this.db.transaction(async (tx) => {
      const r = await this.loadForWrite(tx, actor, id, input.expectedVersion);
      if (input.assigneeUserId) {
        const [u] = await tx
          .select({ isActive: users.isActive })
          .from(users)
          .where(and(eq(users.id, input.assigneeUserId), eq(users.tenantId, actor.user.tenantId)));
        if (!u?.isActive) throw badRequest('INVALID_ASSIGNEE', 'مسئول انتخاب‌شده فعال نیست');
      }
      const patch: Partial<Row> = {};
      if (input.assigneeUserId !== undefined) patch.assigneeUserId = input.assigneeUserId;
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
      if (input.note !== undefined) patch.note = input.note || null;
      if (input.nextAction !== undefined) patch.nextAction = input.nextAction || null;
      const changes = diff(r, patch);
      if (!changes) return;
      const [row] = await tx
        .update(emdadRequests)
        .set({ ...patch, updatedAt: new Date(), version: r.version + 1 })
        .where(and(eq(emdadRequests.id, id), eq(emdadRequests.version, r.version)))
        .returning();
      if (!row) throw versionConflict();
      await this.audit.record(tx, actor, { entityType: 'emdad', entityId: id, caseId: r.caseId, action: 'emdad.follow_up_updated', ...changes, snapshot: { version: row.version, row: { id, ...patch } } });
    });
    return this.get(actor, id);
  }

  /** A person's decision on the case link; afterwards imports never re-match this row. */
  async match(actor: Actor, id: string, input: EmdadMatchInput) {
    await this.db.transaction(async (tx) => {
      const r = await this.loadForWrite(tx, actor, id, input.expectedVersion);
      if (input.caseId) {
        const [c] = await tx.select({ id: cases.id }).from(cases).where(and(eq(cases.id, input.caseId), eq(cases.tenantId, actor.user.tenantId)));
        if (!c) throw notFound('پرونده');
      }
      if (input.partRequestId) {
        if (!input.caseId) throw badRequest('EMDAD_PART_WITHOUT_CASE', 'برای انتخاب نیاز قطعه، ابتدا پرونده را انتخاب کنید');
        const [p] = await tx
          .select({ id: partRequests.id })
          .from(partRequests)
          .where(and(eq(partRequests.id, input.partRequestId), eq(partRequests.caseId, input.caseId), eq(partRequests.tenantId, actor.user.tenantId)));
        if (!p) throw notFound('نیاز قطعه در این پرونده');
      }
      const patch = {
        caseId: input.caseId,
        partRequestId: input.partRequestId ?? null,
        matchStatus: input.caseId ? 'matched' : 'unmatched',
        matchSource: 'manual',
        matchNote: input.note,
      };
      const [row] = await tx
        .update(emdadRequests)
        .set({ ...patch, updatedAt: new Date(), version: r.version + 1 })
        .where(and(eq(emdadRequests.id, id), eq(emdadRequests.version, r.version)))
        .returning();
      if (!row) throw versionConflict();
      await this.audit.record(tx, actor, {
        entityType: 'emdad',
        entityId: id,
        caseId: input.caseId ?? r.caseId,
        action: 'emdad.match_reviewed',
        reason: input.note,
        before: { caseId: r.caseId, partRequestId: r.partRequestId, matchStatus: r.matchStatus },
        after: patch,
        snapshot: { version: row.version, row: { id, ...patch } },
      });
    });
    return this.get(actor, id);
  }

  /** Excel of the filtered list without customer contact data; text cells are formula-safe. */
  async export(actor: Actor, q: EmdadSearchInput) {
    if (!actor.user.permissions.has('emdad.read')) throw forbidden();
    const all: EmdadRequest[] = [];
    for (let page = 1; page <= 200; page++) {
      const r = await this.search(actor, { ...q, page, pageSize: 100 });
      all.push(...r.items);
      if (all.length >= r.total) break;
    }
    const o = (r: EmdadRequest, k: string) => safeCell(String(r.official[k] ?? ''));
    return writeSheet('پیگیری امداد ویژه', [
      ['پرونده منیج', 'پذیرش ایران‌خودرو', 'شاسی', 'شماره امداد', 'شماره درخواست', 'کد اختصاصی اولیه', 'کد قطعه', 'کد کامل تدارکاتی', 'شرح تدارکاتی', 'تعداد تدارکاتی', 'وضعیت امداد (متن رسمی)', 'وضعیت ارسال (متن رسمی)', 'شماره فاکتور', 'تاریخ ترخیص', 'اتصال', 'مسئول', 'اقدام بعدی', 'یادداشت'],
      ...all.map((r) => [
        safeCell(r.caseNumber ?? ''),
        safeCell(r.admissionNo ?? ''),
        safeCell(r.chassis ?? ''),
        safeCell(r.emdadNo ?? ''),
        safeCell(r.requestNo ?? ''),
        safeCell(r.initialCode ?? ''),
        o(r, 'partCode'),
        o(r, 'fullCode'),
        o(r, 'supplyDescription'),
        o(r, 'supplyQuantity'),
        o(r, 'emdadStatus'),
        o(r, 'sendStatus'),
        o(r, 'invoiceNo'),
        o(r, 'releasedAt'),
        safeCell(r.matchNote ?? ''),
        safeCell(r.assigneeName ?? ''),
        safeCell(r.nextAction ?? ''),
        safeCell(r.note ?? ''),
      ]),
    ]);
  }
}
