import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  RECEPTION_IMPORT_FIELDS, RECEPTION_IMPORT_HEADERS, RECEPTION_IMPORT_ROW_TYPES, normalizePersianJobText, toLatinDigits,
  type ReceptionImportCard, type ReceptionImportField, type ReceptionImportFileInput, type ReceptionImportPreview, type ReceptionImportRowType,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import { receptionEvents, receptionImports, receptionParts, receptionRepairs, receptions } from '../db/schema';
import { writeWorkbook } from '../parts/xlsx';
import { readSheets } from '../reference-data/reference-data.service';
import { idKey } from '../vehicle-import/vehicle-sheet';
import { cleanText, kasbInstant, stableJson } from './kasb-table';
import { lockAdmission } from './reception-lock';
import { findCaseLink } from './pulse-link';
import { admissionKey, fullVinKey, isClosed, searchTextOf } from './pulse-map';

// «بارگذاری دستی پذیرش و ریز کارت» (S08, owner 2026-11-28): when Pulse is down, the same data — cards,
// their labour lines (name, code, technician, station) and used parts (code, name, quantity, amount) —
// is entered from an Excel file. The admission number is the key of every row: a card that exists is
// updated, a new one is added, and applying the same file again changes nothing. Pulse adopts a manual
// card when it reads it; manual lines then give way to what Pulse read.

const MAX_BYTES = 5_000_000;
const MAX_ROWS = 20_000;
const HEADER_SCAN = 15;

interface PlanLine { kind: 'labour' | 'part'; rowNo: number; code: string | null; name: string | null; technician: string | null; station: string | null; quantity: string | null; amountRial: number | null }
interface PlanCard {
  admissionNo: string;
  key: string;
  card: Partial<Record<'chassis' | 'vin' | 'vehicleName' | 'modelName' | 'plate' | 'customerName' | 'customerMobile' | 'receptionist' | 'status' | 'hall', string>> & { admittedAt?: string; releasedAt?: string };
  lines: PlanLine[];
  error: string | null;
}
interface Plan {
  columns: ReceptionImportPreview['columns'];
  rowErrors: ReceptionImportPreview['rowErrors'];
  cards: PlanCard[];
  /** Outcome of each card at the last preview or apply (by admission key). */
  outcomes?: Record<string, { outcome: ReceptionImportCard['outcome']; message: string | null }>;
}

const headerKey = (h: string) => normalizePersianJobText(h).toLowerCase().replace(/\s+/g, ' ');
const HEADER_LOOKUP = new Map<string, ReceptionImportField>();
for (const field of RECEPTION_IMPORT_FIELDS) for (const h of RECEPTION_IMPORT_HEADERS[field]) HEADER_LOOKUP.set(headerKey(h), field);
// The template's explicit header for the part amount.
HEADER_LOOKUP.set(headerKey('مبلغ واحد (ریال)'), 'amountRial');

const ROW_TYPES = new Map<string, ReceptionImportRowType>(Object.entries(RECEPTION_IMPORT_ROW_TYPES).map(([k, v]) => [headerKey(v), k as ReceptionImportRowType]));
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const amountOf = (v: string | null) => {
  if (!v) return null;
  const n = Number(toLatinDigits(v).replace(/[,،٬\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n < 1e15 ? Math.round(n) : NaN;
};
const lineKey = (l: PlanLine, ordinal: number) => `m:${l.kind}:${sha(stableJson([l.code, l.name, ordinal])).slice(0, 24)}`;

@Injectable()
export class ReceptionImportService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.handle.db;
  }

  /** Manage's own template: one header row and two synthetic example rows (a card and one labour line). */
  template(): Uint8Array {
    const headers = RECEPTION_IMPORT_FIELDS.map((f) => (f === 'amountRial' ? 'مبلغ واحد (ریال)' : RECEPTION_IMPORT_HEADERS[f][0]!));
    const example: Partial<Record<ReceptionImportField, string>> = { admissionNo: '1405000001', rowType: 'کارت', chassis: 'TESTCH01', vehicleName: 'خودروی نمونه', customerName: 'مشتری نمونه', receptionist: 'پذیرشگر نمونه', admittedDate: '1405/09/07', admittedTime: '08:30' };
    const labour: Partial<Record<ReceptionImportField, string>> = { admissionNo: '1405000001', rowType: 'اجرت', code: '0100', name: 'سرویس ۱۰۰۰۰', technician: 'تعمیرکار نمونه', station: 'جایگاه ۱' };
    const row = (v: Partial<Record<ReceptionImportField, string>>) => RECEPTION_IMPORT_FIELDS.map((f) => v[f] ?? '');
    return writeWorkbook([{ name: 'پذیرش و ریز کارت', rows: [headers, row(example), row(labour)] }]);
  }

  private parse(bytes: Uint8Array): Plan {
    let sheets: { name: string; rows: string[][] }[];
    try {
      sheets = readSheets(bytes);
    } catch (e) {
      throw badRequest('RECEPTION_IMPORT_FILE', e instanceof Error ? e.message : 'فایل خوانده نشد');
    }
    for (const sheet of sheets) {
      const headerAt = sheet.rows.slice(0, HEADER_SCAN).findIndex((r) => r.some((c) => HEADER_LOOKUP.get(headerKey(c ?? '')) === 'admissionNo'));
      if (headerAt < 0) continue;
      const header = sheet.rows[headerAt]!;
      const columns = header.map((h) => ({ header: (h ?? '').trim(), field: HEADER_LOOKUP.get(headerKey(h ?? '')) ?? null })).filter((c) => c.header);
      const index = new Map<ReceptionImportField, number>();
      header.forEach((h, i) => { const f = HEADER_LOOKUP.get(headerKey(h ?? '')); if (f && !index.has(f)) index.set(f, i); });
      const rows = sheet.rows.slice(headerAt + 1);
      if (rows.length > MAX_ROWS) throw badRequest('RECEPTION_IMPORT_LARGE', `حداکثر ${MAX_ROWS} ردیف در یک فایل پذیرفته می‌شود.`);
      return { columns, ...this.rows(rows, headerAt + 2, index) };
    }
    throw badRequest('RECEPTION_IMPORT_LAYOUT', 'ستون «شماره پذیرش» در ۱۵ ردیف اول هیچ برگه‌ای پیدا نشد؛ قالب «پذیرش و ریز کارت» منیج را به کار ببرید.');
  }

  private rows(rows: string[][], firstRowNo: number, index: Map<ReceptionImportField, number>): Pick<Plan, 'rowErrors' | 'cards'> {
    const rowErrors: Plan['rowErrors'] = [];
    const cards = new Map<string, PlanCard>();
    const get = (r: string[], f: ReceptionImportField) => { const i = index.get(f); return i == null ? null : cleanText(r[i]); };
    rows.forEach((r, i) => {
      const rowNo = firstRowNo + i;
      if (!r.some((c) => c?.trim())) return;
      const admissionNo = get(r, 'admissionNo');
      const key = admissionNo ? admissionKey(toLatinDigits(admissionNo)) : null;
      if (!admissionNo || !key) return void rowErrors.push({ rowNo, message: admissionNo ? `شمارهٔ پذیرش «${admissionNo}» شناسهٔ یک کارت نیست.` : 'شمارهٔ پذیرش خالی است.' });
      const typeText = get(r, 'rowType');
      const type = typeText ? ROW_TYPES.get(headerKey(typeText)) : 'card';
      if (!type) return void rowErrors.push({ rowNo, message: `نوع ردیف «${typeText}» شناخته نشد (کارت، اجرت یا قطعه).` });
      const card = cards.get(key) ?? { admissionNo: toLatinDigits(admissionNo), key, card: {}, lines: [], error: null };
      cards.set(key, card);
      // Card fields may sit on any row of the card; two different values for one card are an error, never a choice.
      const put = (field: keyof PlanCard['card'], value: string | null | undefined) => {
        if (!value) return;
        const old = card.card[field];
        if (old && old !== value) card.error = `برای این کارت دو مقدار متفاوت در «${RECEPTION_IMPORT_HEADERS[field as ReceptionImportField]?.[0] ?? field}» آمده است.`;
        else card.card[field] = value;
      };
      const chassis = get(r, 'chassis');
      put('chassis', chassis ? idKey(chassis) : null);
      const vin = get(r, 'vin');
      put('vin', vin ? idKey(vin) : null);
      for (const f of ['vehicleName', 'modelName', 'plate', 'customerName', 'receptionist', 'status', 'hall'] as const) put(f, get(r, f));
      const mobile = get(r, 'customerMobile');
      put('customerMobile', mobile ? toLatinDigits(mobile).replace(/\s+/g, '') : null);
      const dated = (date: ReceptionImportField, time: ReceptionImportField, label: string): string | null | false => {
        const d = get(r, date);
        if (!d) return null;
        const at = kasbInstant(toLatinDigits(d), get(r, time) ? toLatinDigits(get(r, time)!) : undefined);
        if (!at) { rowErrors.push({ rowNo, message: `${label} «${d}» خوانده نشد (مثل ۱۴۰۵/۰۹/۰۷).` }); return false; }
        return at.toISOString();
      };
      const admitted = dated('admittedDate', 'admittedTime', 'تاریخ پذیرش');
      const released = dated('releasedDate', 'releasedTime', 'تاریخ ترخیص');
      if (admitted === false || released === false) return;
      put('admittedAt', admitted);
      put('releasedAt', released);
      if (type === 'card') return;
      const amount = amountOf(get(r, 'amountRial'));
      if (Number.isNaN(amount)) return void rowErrors.push({ rowNo, message: 'مبلغ باید عدد ریالی باشد.' });
      const quantity = get(r, 'quantity');
      const line: PlanLine = { kind: type, rowNo, code: get(r, 'code') ? toLatinDigits(get(r, 'code')!) : null, name: get(r, 'name'), technician: get(r, 'technician'), station: get(r, 'station'), quantity: quantity ? toLatinDigits(quantity) : null, amountRial: amount };
      if (!line.code && !line.name) return void rowErrors.push({ rowNo, message: `ردیف ${type === 'labour' ? 'اجرت' : 'قطعه'} کد یا نام ندارد.` });
      card.lines.push(line);
    });
    return { rowErrors, cards: [...cards.values()] };
  }

  /** What applying the plan would do to each card, from the receptions stored now. */
  private async outcomes(tx: DbOrTx, tenantId: string, plan: Plan): Promise<NonNullable<Plan['outcomes']>> {
    const keys = plan.cards.map((c) => c.key);
    const stored = keys.length ? await tx.select().from(receptions).where(and(eq(receptions.tenantId, tenantId), inArray(receptions.admissionNoKey, keys))) : [];
    const out: NonNullable<Plan['outcomes']> = {};
    for (const c of plan.cards) {
      const mine = stored.filter((r) => r.admissionNoKey === c.key);
      if (c.error) out[c.key] = { outcome: 'error', message: c.error };
      else if (mine.length > 1) out[c.key] = { outcome: 'error', message: 'این شمارهٔ پذیرش در منیج به بیش از یک کارت می‌رسد؛ دستی بررسی شود.' };
      else if (!mine.length) out[c.key] = c.card.admittedAt ? { outcome: 'new', message: null } : { outcome: 'error', message: 'کارت تازه بدون «تاریخ پذیرش» ثبت نمی‌شود.' };
      else out[c.key] = { outcome: this.changes(mine[0]!, c) ? 'update' : 'unchanged', message: null };
    }
    return out;
  }

  /** Card values of the file that differ from the stored reception (lines are compared on apply). */
  private changes(r: typeof receptions.$inferSelect, c: PlanCard): boolean {
    const v = this.cardValues(c);
    const differs = (a: unknown, b: unknown) => (a instanceof Date ? a.getTime() : a ?? null) !== (b instanceof Date ? b.getTime() : b ?? null);
    return (Object.entries(v) as [keyof typeof v, unknown][]).some(([k, value]) => value != null && differs(r[k as keyof typeof r], value)) || c.lines.length > 0;
  }

  private cardValues(c: PlanCard) {
    const v = c.card;
    const releasedAt = v.releasedAt ? new Date(v.releasedAt) : null;
    const closed = isClosed(releasedAt, v.status ?? null);
    return {
      chassis: v.chassis ?? null, vin: fullVinKey(v.vin ?? null) ?? null, productName: v.vehicleName ?? null, modelName: v.modelName ?? null, plate: v.plate ?? null,
      customerName: v.customerName ?? null, customerMobile: v.customerMobile ?? null, receptionist: v.receptionist ?? null, statusText: v.status ?? null, hall: v.hall ?? null,
      admittedAt: v.admittedAt ? new Date(v.admittedAt) : null,
      // Released only on the file's word (a release date or a closing status); otherwise left as stored.
      ...(closed ? { isOpen: false, releasedAt: releasedAt ?? undefined } : {}),
    };
  }

  private view(row: typeof receptionImports.$inferSelect): ReceptionImportPreview {
    const plan = row.plan as unknown as Plan;
    const outcomes = plan.outcomes ?? {};
    const cards: ReceptionImportCard[] = plan.cards.map((c) => ({
      admissionNo: c.admissionNo, outcome: outcomes[c.key]?.outcome ?? 'error', message: outcomes[c.key]?.message ?? null,
      labour: c.lines.filter((l) => l.kind === 'labour').length, parts: c.lines.filter((l) => l.kind === 'part').length,
    }));
    const count = (o: ReceptionImportCard['outcome']) => cards.filter((c) => c.outcome === o).length;
    return {
      id: row.id, fileName: row.fileName, status: row.status as ReceptionImportPreview['status'], columns: plan.columns, cards, rowErrors: plan.rowErrors,
      counts: { new: count('new'), update: count('update'), unchanged: count('unchanged'), error: count('error'), labour: cards.reduce((n, c) => n + c.labour, 0), parts: cards.reduce((n, c) => n + c.parts, 0) },
      createdAt: row.createdAt.toISOString(), appliedAt: row.appliedAt?.toISOString() ?? null,
    };
  }

  /** The newest file of the dealership, for the «منبع‌ها» page. */
  async latest(actor: Actor): Promise<ReceptionImportPreview | null> {
    const [row] = await this.db.select().from(receptionImports).where(eq(receptionImports.tenantId, actor.user.tenantId)).orderBy(desc(receptionImports.createdAt)).limit(1);
    return row ? this.view(row) : null;
  }

  /** Reads the file and shows what it would do. The same file again returns its earlier preview (or applied result). */
  async preview(actor: Actor, input: ReceptionImportFileInput): Promise<ReceptionImportPreview> {
    const bytes = Buffer.from(input.fileBase64, 'base64');
    if (!bytes.length || bytes.length > MAX_BYTES) throw badRequest('RECEPTION_IMPORT_LARGE', 'فایل باید کمتر از پنج مگابایت باشد.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const tenantId = actor.user.tenantId;
    const [same] = await this.db.select().from(receptionImports).where(and(eq(receptionImports.tenantId, tenantId), eq(receptionImports.sha256, digest)));
    if (same) return this.view(same);
    const plan = this.parse(bytes);
    if (!plan.cards.length && !plan.rowErrors.length) throw badRequest('RECEPTION_IMPORT_EMPTY', 'فایل ردیف قابل‌خواندنی ندارد.');
    plan.outcomes = await this.outcomes(this.db, tenantId, plan);
    const id = newId();
    await this.db.transaction(async (tx) => {
      await tx.insert(receptionImports).values({ id, tenantId, fileName: input.fileName.slice(0, 200), sha256: digest, plan: plan as unknown as Record<string, unknown>, rowCount: plan.cards.reduce((n, c) => n + 1 + c.lines.length, 0), errorCount: plan.rowErrors.length, createdBy: actor.user.id, isTest: actor.user.isTestTenant });
      await this.audit.record(tx, actor, { entityType: 'reception_import', entityId: id, action: 'reception.manual_import_previewed', after: { fileName: input.fileName.slice(0, 200), cards: plan.cards.length, rowErrors: plan.rowErrors.length } });
    });
    const [row] = await this.db.select().from(receptionImports).where(eq(receptionImports.id, id));
    return this.view(row!);
  }

  /** Applies a preview once, in one transaction. Cards with an error are skipped and stay listed. */
  async apply(actor: Actor, id: string): Promise<ReceptionImportPreview> {
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      const [imp] = await tx.select().from(receptionImports).where(and(eq(receptionImports.tenantId, tenantId), eq(receptionImports.id, id))).for('update');
      if (!imp) throw notFound('فایل پذیرش و ریز کارت');
      if (imp.status === 'applied') throw conflict('RECEPTION_IMPORT_APPLIED', 'این فایل قبلاً ثبت شده است؛ ثبت دوباره چیزی را تغییر نمی‌دهد.');
      const plan = imp.plan as unknown as Plan;
      const now = new Date();
      const totals = { created: 0, updated: 0, unchanged: 0, skipped: 0, lines: 0 };
      for (const c of plan.cards) {
        await lockAdmission(tx, this.handle.driver, tenantId, c.key);
        const result = await this.applyCard(tx, actor, imp.id, c, now);
        totals[result] += 1;
      }
      plan.outcomes = await this.outcomes(tx, tenantId, plan);
      await tx.update(receptionImports).set({ status: 'applied', appliedAt: now, appliedBy: actor.user.id, plan: plan as unknown as Record<string, unknown> }).where(eq(receptionImports.id, imp.id));
      await this.audit.record(tx, actor, { entityType: 'reception_import', entityId: imp.id, action: 'reception.manual_import_applied', after: totals });
    });
    const [row] = await this.db.select().from(receptionImports).where(eq(receptionImports.id, id));
    return this.view(row!);
  }

  private async applyCard(tx: DbOrTx, actor: Actor, importId: string, c: PlanCard, now: Date): Promise<'created' | 'updated' | 'unchanged' | 'skipped'> {
    const tenantId = actor.user.tenantId;
    if (c.error) return 'skipped';
    const stored = await tx.select().from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(receptions.admissionNoKey, c.key))).limit(2);
    if (stored.length > 1) return 'skipped';
    const values = this.cardValues(c);
    const present = Object.fromEntries(Object.entries(values).filter(([, v]) => v != null)) as Partial<typeof values>;
    let receptionId: string;
    let result: 'created' | 'updated' | 'unchanged';
    if (!stored.length) {
      if (!values.admittedAt) return 'skipped';
      receptionId = newId();
      const official = { manual: true, importId, admissionNo: c.admissionNo, ...c.card };
      const link = await findCaseLink(tx, tenantId, c.key, values.vin);
      const closed = values.isOpen === false;
      await tx.insert(receptions).values({
        id: receptionId, tenantId, kasbRcd: `manual:${c.key}`, source: 'manual', admissionNo: c.admissionNo, admissionNoKey: c.key, ...present,
        isOpen: !closed, releasedAt: closed ? values.releasedAt ?? now : null,
        searchText: searchTextOf([c.admissionNo, values.plate, values.chassis, values.vin, values.customerName, values.productName, values.modelName]),
        official, rowHash: `manual:${stableJson(official)}`.slice(0, 200), firstSeenAt: now, lastSeenAt: now,
        caseId: link.state === 'linked' ? link.caseIds[0]! : null, linkState: link.state, isTest: actor.user.isTestTenant,
      });
      await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId, kind: 'created', data: { manual: true, importId }, actorUserId: actor.user.id, occurredAt: now, isTest: actor.user.isTestTenant });
      if (closed) await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId, kind: 'released', data: { manual: true }, actorUserId: actor.user.id, occurredAt: now, isTest: actor.user.isTestTenant });
      result = 'created';
    } else {
      const r = stored[0]!;
      receptionId = r.id;
      const changed = this.changes(r, { ...c, lines: [] });
      if (changed) {
        // rowHash is cleared so that Pulse, once back, writes the official card over these values.
        await tx.update(receptions).set({ ...present, rowHash: '', updatedAt: now, version: r.version + 1 }).where(eq(receptions.id, r.id));
        if (r.isOpen && values.isOpen === false) await tx.insert(receptionEvents).values({ id: newId(), tenantId, receptionId, kind: 'released', data: { manual: true }, actorUserId: actor.user.id, occurredAt: now, isTest: actor.user.isTestTenant });
      }
      result = changed ? 'updated' : 'unchanged';
    }
    if (await this.applyLines(tx, actor, receptionId, c, now)) {
      await tx.update(receptions).set({ linesReadAt: now }).where(and(eq(receptions.id, receptionId), eq(receptions.source, 'manual')));
      if (result === 'unchanged') result = 'updated';
    }
    return result;
  }

  /**
   * Manual lines of one card: keyed «m:<kind>:<hash of code, name, ordinal>», so the same file adds
   * nothing new; a manual line of a kind the file lists for this card but no longer has is marked
   * removed. A line Pulse already read (same code, or same name without a code) is not doubled.
   */
  private async applyLines(tx: DbOrTx, actor: Actor, receptionId: string, c: PlanCard, now: Date): Promise<boolean> {
    const tenantId = actor.user.tenantId;
    let touched = false;
    for (const kind of ['labour', 'part'] as const) {
      const lines = c.lines.filter((l) => l.kind === kind);
      if (!lines.length) continue;
      const table = (kind === 'labour' ? receptionRepairs : receptionParts) as unknown as typeof receptionParts;
      const existing = await tx.select({ id: table.id, lineId: table.kasbLineId, code: table.code, name: table.name, removedAt: table.removedAt }).from(table).where(and(eq(table.tenantId, tenantId), eq(table.receptionId, receptionId)));
      const fromPulse = existing.filter((e) => !e.lineId.startsWith('m:') && !e.removedAt);
      const seen = new Map<string, number>();
      const keep = new Set<string>();
      for (const l of lines) {
        if (fromPulse.some((p) => (l.code && p.code === l.code) || (!l.code && l.name && p.name === l.name))) continue;
        const sig = stableJson([l.code, l.name]);
        const ordinal = (seen.get(sig) ?? 0) + 1;
        seen.set(sig, ordinal);
        const lineId = lineKey(l, ordinal);
        keep.add(lineId);
        const official = { manual: true, rowNo: l.rowNo, code: l.code, name: l.name, technician: l.technician, station: l.station, quantity: l.quantity, amountRial: l.amountRial };
        const hash = sha(stableJson(official));
        const columns = kind === 'labour'
          ? { code: l.code, description: l.name, name: l.name, technician: l.technician, station: l.station }
          : { code: l.code, name: l.name, qtyRequested: l.quantity, qtyFinal: l.quantity, unitPriceRial: l.amountRial };
        const old = existing.find((e) => e.lineId === lineId);
        if (!old) {
          await tx.insert(table).values({ id: newId(), tenantId, receptionId, kasbLineId: lineId, official, rowHash: hash, ...columns, firstSeenAt: now, updatedAt: now, isTest: actor.user.isTestTenant } as never);
          touched = true;
        } else if (old.removedAt) {
          await tx.update(table).set({ ...columns, official, rowHash: hash, removedAt: null, updatedAt: now } as never).where(eq(table.id, old.id));
          touched = true;
        }
      }
      for (const e of existing) {
        if (e.lineId.startsWith(`m:${kind}:`) && !e.removedAt && !keep.has(e.lineId)) {
          await tx.update(table).set({ removedAt: now, updatedAt: now } as never).where(and(eq(table.id, e.id), isNull(table.removedAt)));
          touched = true;
        }
      }
    }
    return touched;
  }
}
