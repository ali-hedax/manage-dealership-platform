import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  daysBetween, EMDAD_ARRIVED_CATEGORIES, EMDAD_STATUS_CATEGORY_LABELS, type EmdadStatusCategory, emdadNoKey, headerKey, maskPhone, parseJalali, parseStoppageGrid, permissionsFor, shortVehicleName,
  STOPPAGE_AGE_BUCKETS, STOPPAGE_COLUMNS, STOPPAGE_MAX_BYTES, STOPPAGE_FIELDS, STOPPAGE_PARSER_VERSION, STOPPAGE_REASON_KINDS, STOPPAGE_REASON_LABELS, STOPPAGE_SHEET,
  STOPPAGE_STAGE_LABELS, STOPPAGE_STAGES, isKnownStoppageStatus, stoppageItemActive, stoppageItemStage, stoppageReasonKind, stoppageStage, stoppageStartedAt,
  type NightListView, type ParsedStoppageRow, type ParsedStoppageSheet, type Role, type StoppageAidLink, type StoppageCaseView, type StoppageImportPreview,
  type StoppageImportResult, type StoppageItemView, type StoppageLastImport, type StoppageLinkInput, type StoppageLinkState, type StoppageListKind,
  type StoppageListView, type StoppageOfficial, type StoppageOwnerInput, type StoppageReport, type StoppageStage, type StoppageSummary,
} from '@manage/shared';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, conflict, notFound, versionConflict } from '../common/errors';
import { newId } from '../common/ids';
import { detectFormat, FORMAT_ERRORS } from '../daily-reports/spreadsheet-formats';
import { DATABASE, type DatabaseHandle, type DbOrTx } from '../db/database';
import {
  emdadRequests, nightListItems, nightLists, receptions, stoppageImports, stoppageItems, stoppageItemVersions, stoppages, tenants, users,
} from '../db/schema';
import { readWorkbook, XlsxError } from '../parts/xlsx';

const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const rowHash = (o: StoppageOfficial) => sha256(JSON.stringify(STOPPAGE_FIELDS.map((f) => o[f])));
const DAY = 86_400_000;
/** The list is shown as possibly behind کسب‌وکار when the last file is older than this. */
const STALE_MS = 30 * 3_600_000;
/** A row-count drop below this share of the previous file needs explicit acceptance. */
const DROP_RATIO = 0.5;
const HEADER_FIELDS = ['chassis', 'cardStatus', 'ownerName', 'ownerPhone', 'km', 'vehicleType', 'date'] as const;

type StoppageRow = typeof stoppages.$inferSelect;
type ItemRow = typeof stoppageItems.$inferSelect;
type Read = { parsed: ParsedStoppageSheet; blocked: string | null };
const chunks = <T>(list: T[], size = 500) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/**
 * «خودروهای متوقف»: the official «گزارش توقف خودرو» of کسب‌وکار imported as followed-up cases
 * (owner, 2026-11-26; reconstruction step 1A). The file is read in memory and never stored; the
 * same file applied twice changes nothing; nothing is deleted.
 */
@Injectable()
export class StoppagesService {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle, private readonly audit: AuditService) {}

  private get db() {
    return this.handle.db;
  }

  /** Reads the .xlsx in memory. Anything that is not the official layout is blocked, never guessed. */
  read(data: Uint8Array): Read {
    const empty: ParsedStoppageSheet = { rows: [], errors: [], warnings: [], headerProblem: null };
    if (!data?.length) return { parsed: empty, blocked: 'فایل خالی است.' };
    if (data.length > STOPPAGE_MAX_BYTES) return { parsed: empty, blocked: 'فایل بزرگ‌تر از ۵ مگابایت است؛ بازهٔ تاریخ گزارش را کوتاه‌تر کنید.' };
    const format = detectFormat(data);
    if (format === 'html_table' || format === 'spreadsheetml') {
      return { parsed: empty, blocked: 'این فایل اکسل گزارش توقف نیست (صفحهٔ وب یا قالب دیگری است؛ شاید صفحهٔ ورود کسب‌وکار ذخیره شده). خروجی Excel همان گزارش را دوباره بگیرید.' };
    }
    if (format !== 'xlsx') return { parsed: empty, blocked: FORMAT_ERRORS[format] };
    try {
      const sheets = readWorkbook(data);
      const sheet = sheets.find((s) => headerKey(s.name) === headerKey(STOPPAGE_SHEET)) ?? sheets[0]!;
      const parsed = parseStoppageGrid(sheet.rows, sheet.name);
      return { parsed, blocked: parsed.headerProblem ?? (parsed.rows.length ? null : 'هیچ ردیف قابل‌خواندنی در فایل نیست.') };
    } catch (e) {
      if (e instanceof XlsxError) return { parsed: empty, blocked: e.message };
      throw e;
    }
  }

  async preview(actor: Actor, fileName: string, data: Uint8Array, db: DbOrTx = this.db): Promise<StoppageImportPreview> {
    const tenantId = actor.user.tenantId;
    const fileHash = sha256(data);
    const { parsed, blocked } = this.read(data);
    const [dup] = await db.select({ id: stoppageImports.id }).from(stoppageImports)
      .where(and(eq(stoppageImports.tenantId, tenantId), eq(stoppageImports.fileHash, fileHash))).limit(1);
    const known = new Map<string, { hash: string; active: boolean }>();
    for (const part of chunks(parsed.rows.map((r) => r.key))) {
      for (const x of await db.select({ key: stoppageItems.rowKey, hash: stoppageItems.rowHash, active: stoppageItems.active }).from(stoppageItems)
        .where(and(eq(stoppageItems.tenantId, tenantId), inArray(stoppageItems.rowKey, part)))) known.set(x.key, { hash: x.hash, active: x.active });
    }
    const [{ activeKnown } = { activeKnown: 0 }] = await db.select({ activeKnown: sql<number>`count(*)::int` }).from(stoppageItems)
      .where(and(eq(stoppageItems.tenantId, tenantId), eq(stoppageItems.active, true)));
    const [previous] = await db.select({ rows: stoppageImports.rowCount }).from(stoppageImports)
      .where(eq(stoppageImports.tenantId, tenantId)).orderBy(desc(stoppageImports.importedAt)).limit(1);
    let newRows = 0, changedRows = 0, unchangedRows = 0, activeInFile = 0;
    for (const r of parsed.rows) {
      const k = known.get(r.key);
      if (!k) newRows += 1;
      else if (k.hash !== rowHash(r.official)) changedRows += 1;
      else unchangedRows += 1;
    }
    const groups = groupRows(parsed.rows);
    for (const rows of groups.values()) if (rows.some((r) => stoppageItemActive(r.official))) activeInFile += 1;
    const inFileActiveKnown = parsed.rows.filter((r) => known.get(r.key)?.active).length;
    const warnings = [...parsed.warnings];
    let needsAcceptance = false;
    if (previous && previous.rows >= 10 && parsed.rows.length < previous.rows * DROP_RATIO) {
      warnings.push(`تعداد ردیف‌ها نسبت به فایل قبلی خیلی کم شده است (${parsed.rows.length} در برابر ${previous.rows}). بازهٔ تاریخ گزارش را بررسی کنید.`);
      needsAcceptance = true;
    }
    if (parsed.errors.length) {
      warnings.push(`${parsed.errors.length} ردیف خوانده نشد و ثبت نمی‌شود.`);
      needsAcceptance = true;
    }
    const unknown = new Set(parsed.rows.map((r) => r.official.status).filter((s) => s && !isKnownStoppageStatus(s)));
    if (unknown.size) warnings.push(`وضعیت توقف ناشناخته: ${[...unknown].map((s) => `«${s}»`).join('، ')}. ردیف‌ها ثبت و برای بررسی علامت می‌خورند.`);
    return {
      fileHash, fileName, duplicate: !!dup,
      rows: parsed.rows.length, stoppages: groups.size, activeStoppages: activeInFile,
      newRows, changedRows, unchangedRows,
      missingFromFile: Math.max(0, activeKnown - inFileActiveKnown),
      errors: parsed.errors.slice(0, 200),
      rowNotes: parsed.rows.flatMap((r) => r.notes.map((message) => ({ row: r.row, message }))).slice(0, 200),
      warnings, blocked, needsAcceptance,
    };
  }

  /** Applies a previewed file: the caller confirms the SHA-256 it saw. Idempotent by file hash. */
  async importFile(actor: Actor, fileName: string, data: Uint8Array, confirm: string, acceptWarnings: boolean, source: 'manual' | 'pulse' = 'manual'): Promise<StoppageImportResult> {
    const tenantId = actor.user.tenantId;
    const fileHash = sha256(data);
    if (fileHash !== confirm) throw conflict('STOPPAGE_FILE_CHANGED', 'این فایل با فایلی که پیش‌نمایش شد یکی نیست؛ دوباره پیش‌نمایش بگیرید.');
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`stoppage:${tenantId}`}))`);
      const preview = await this.preview(actor, fileName, data, tx);
      if (preview.blocked) throw badRequest('STOPPAGE_FILE_BLOCKED', preview.blocked);
      const [dup] = await tx.select({ id: stoppageImports.id }).from(stoppageImports)
        .where(and(eq(stoppageImports.tenantId, tenantId), eq(stoppageImports.fileHash, fileHash))).limit(1);
      if (dup) return { importId: dup.id, duplicate: true, preview };
      if (preview.needsAcceptance && !acceptWarnings) throw conflict('STOPPAGE_WARNINGS', 'فایل هشدار دارد؛ پس از دیدن هشدارها «با وجود هشدار ثبت شود» را بزنید.', { warnings: preview.warnings });
      const { parsed } = this.read(data);
      const importId = newId();
      const now = new Date();
      const isTest = actor.user.isTestTenant;
      const summary = { newRows: preview.newRows, changedRows: preview.changedRows, unchangedRows: preview.unchangedRows, errors: preview.errors.length, missingFromFile: preview.missingFromFile, activeStoppages: preview.activeStoppages };
      await tx.insert(stoppageImports).values({ id: importId, tenantId, fileName, fileHash, source, parserVersion: STOPPAGE_PARSER_VERSION, rowCount: parsed.rows.length, stoppageCount: preview.stoppages, summary, importedBy: actor.user.id, importedAt: now, isTest });

      const groups = groupRows(parsed.rows);
      const notices = [...groups.keys()];
      const existing = new Map<string, StoppageRow>();
      for (const part of chunks(notices)) for (const s of await tx.select().from(stoppages).where(and(eq(stoppages.tenantId, tenantId), inArray(stoppages.noticeNo, part)))) existing.set(s.noticeNo, s);
      const items = new Map<string, ItemRow>();
      for (const part of chunks(parsed.rows.map((r) => r.key))) for (const i of await tx.select().from(stoppageItems).where(and(eq(stoppageItems.tenantId, tenantId), inArray(stoppageItems.rowKey, part)))) items.set(i.rowKey, i);

      const touched: string[] = [];
      for (const [noticeNo, rows] of groups) {
        const last = rows[rows.length - 1]!.official;
        const official = Object.fromEntries(HEADER_FIELDS.map((f) => [f, last[f]]));
        const s = existing.get(noticeNo);
        const stoppageId = s?.id ?? newId();
        if (!s) {
          await tx.insert(stoppages).values({ id: stoppageId, tenantId, noticeNo, chassis: last.chassis, official, active: true, stage: 'created', firstImportId: importId, lastImportId: importId, isTest });
        } else {
          await tx.update(stoppages).set({ chassis: last.chassis, official, lastImportId: importId, updatedAt: now, version: s.version + 1 })
            .where(and(eq(stoppages.tenantId, tenantId), eq(stoppages.id, s.id)));
        }
        touched.push(stoppageId);
        for (const r of rows) {
          const hash = rowHash(r.official);
          const item = items.get(r.key);
          if (!item) {
            const id = newId();
            await tx.insert(stoppageItems).values({ id, tenantId, stoppageId, rowKey: r.key, official: r.official, notes: r.notes, rowHash: hash, active: stoppageItemActive(r.official), stage: stoppageItemStage(r.official), firstImportId: importId, lastImportId: importId, isTest });
            await tx.insert(stoppageItemVersions).values({ id: newId(), tenantId, itemId: id, importId, official: r.official, rowHash: hash, observedAt: now, isTest });
          } else if (item.rowHash !== hash) {
            await tx.update(stoppageItems).set({ stoppageId, official: r.official, notes: r.notes, rowHash: hash, lastImportId: importId, updatedAt: now, version: item.version + 1 })
              .where(and(eq(stoppageItems.tenantId, tenantId), eq(stoppageItems.id, item.id)));
            await tx.insert(stoppageItemVersions).values({ id: newId(), tenantId, itemId: item.id, importId, official: r.official, rowHash: hash, observedAt: now, isTest });
          } else {
            await tx.update(stoppageItems).set({ lastImportId: importId }).where(and(eq(stoppageItems.tenantId, tenantId), eq(stoppageItems.id, item.id)));
          }
        }
      }
      await this.reconcile(tx, tenantId, touched);
      await this.audit.record(tx, actor, { entityType: 'stoppage_import', entityId: importId, action: 'stoppage.imported', after: { fileName, rows: parsed.rows.length, stoppages: groups.size, ...summary } });
      return { importId, duplicate: false, preview };
    });
  }

  /**
   * Recomputes stages, the special-aid link of each «امدادویژه» item and the reception link of
   * each stoppage. Items that were not in the last file keep their stored official values.
   */
  async reconcile(tx: DbOrTx, tenantId: string, stoppageIds: string[]) {
    if (!stoppageIds.length) return;
    for (const ids of chunks(stoppageIds, 200)) {
      const list = await tx.select().from(stoppages).where(and(eq(stoppages.tenantId, tenantId), inArray(stoppages.id, ids)));
      const all = await tx.select().from(stoppageItems).where(and(eq(stoppageItems.tenantId, tenantId), inArray(stoppageItems.stoppageId, ids)));
      const chassisList = [...new Set(list.map((s) => s.chassis))];
      const aid = chassisList.length ? await tx.select({ id: emdadRequests.id, chassis: emdadRequests.chassis, emdadNo: emdadRequests.emdadNo, initialCode: emdadRequests.initialCode, official: emdadRequests.official, statusCategory: emdadRequests.statusCategory })
        .from(emdadRequests).where(and(eq(emdadRequests.tenantId, tenantId), isNotNull(emdadRequests.emdadNo), inArray(sql`upper(${emdadRequests.chassis})`, chassisList))) : [];
      const recs = chassisList.length ? await tx.select({ id: receptions.id, chassis: receptions.chassis, admittedAt: receptions.admittedAt, releasedAt: receptions.releasedAt })
        .from(receptions).where(and(eq(receptions.tenantId, tenantId), inArray(sql`upper(${receptions.chassis})`, chassisList))) : [];
      for (const s of list) {
        const its = all.filter((i) => i.stoppageId === s.id);
        const states: { stage: StoppageStage; active: boolean }[] = [];
        for (const i of its) {
          const o = i.official as StoppageOfficial;
          let aidLink: StoppageAidLink | null = null;
          let requestId: string | null = null;
          let arrived = false;
          if (stoppageReasonKind(o.reason) === 'special_aid') {
            const key = emdadNoKey(o.referenceNo);
            let found = aid.filter((a) => (a.chassis ?? '').toUpperCase() === s.chassis && emdadNoKey(a.emdadNo) === key);
            if (found.length > 1 && o.partCode) found = found.filter((a) => a.initialCode === o.partCode || String((a.official as Record<string, unknown>).fullCodeBase ?? '').startsWith(o.partCode));
            aidLink = found.length === 1 ? 'linked' : found.length ? 'ambiguous' : 'not_found';
            requestId = found.length === 1 ? found[0]!.id : null;
            arrived = found.length === 1 && (EMDAD_ARRIVED_CATEGORIES as readonly string[]).includes(found[0]!.statusCategory);
          }
          const stage = stoppageItemStage(o, arrived);
          const active = stoppageItemActive(o);
          states.push({ stage, active });
          if (stage !== i.stage || active !== i.active || aidLink !== i.aidLink || requestId !== i.emdadRequestId) {
            await tx.update(stoppageItems).set({ stage, active, aidLink, emdadRequestId: requestId, updatedAt: new Date() })
              .where(and(eq(stoppageItems.tenantId, tenantId), eq(stoppageItems.id, i.id)));
          }
        }
        const officials = its.map((i) => i.official as StoppageOfficial);
        const active = states.some((x) => x.active);
        const stoppedAt = stoppageStartedAt(officials);
        const ends = officials.map((o) => parseJalali(o.endDate || o.rejectDate)).filter((d): d is Date => !!d);
        const endedAt = active ? null : ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : s.endedAt ?? new Date();
        const patch: Partial<StoppageRow> = { active, stage: stoppageStage(states), stoppedAt, endedAt };
        if (s.linkState !== 'manual') {
          const from = stoppedAt?.getTime();
          const fits = from === undefined ? [] : recs.filter((r) => (r.chassis ?? '').toUpperCase() === s.chassis && r.admittedAt && r.admittedAt.getTime() <= from + DAY
            && (!r.releasedAt || r.releasedAt.getTime() >= from - DAY));
          patch.receptionId = fits.length === 1 ? fits[0]!.id : null;
          patch.linkState = fits.length === 1 ? 'linked' : fits.length ? 'ambiguous' : 'none';
          patch.linkNote = fits.length > 1 ? `${fits.length} پذیرش با همین شاسی در بازهٔ توقف` : null;
        }
        await tx.update(stoppages).set(patch).where(and(eq(stoppages.tenantId, tenantId), eq(stoppages.id, s.id)));
      }
    }
  }

  // ------------------------------------------------------------------ reads

  private async lastImport(tenantId: string): Promise<StoppageLastImport | null> {
    const [x] = await this.db.select({ at: stoppageImports.importedAt, fileName: stoppageImports.fileName, rows: stoppageImports.rowCount, byName: users.displayName })
      .from(stoppageImports).leftJoin(users, eq(users.id, stoppageImports.importedBy))
      .where(eq(stoppageImports.tenantId, tenantId)).orderBy(desc(stoppageImports.importedAt)).limit(1);
    return x ? { at: x.at.toISOString(), fileName: x.fileName, rows: x.rows, byName: x.byName } : null;
  }

  private async summaries(actor: Actor, where?: ReturnType<typeof and>, now = new Date()): Promise<StoppageSummary[]> {
    const tenantId = actor.user.tenantId;
    const rows = await this.db.select({ s: stoppages, followUpName: users.displayName, admissionNo: receptions.admissionNo })
      .from(stoppages).leftJoin(users, eq(users.id, stoppages.followUpUserId)).leftJoin(receptions, eq(receptions.id, stoppages.receptionId))
      .where(where ? and(eq(stoppages.tenantId, tenantId), where) : eq(stoppages.tenantId, tenantId));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.s.id);
    const its: ItemRow[] = [];
    for (const part of chunks(ids)) its.push(...await this.db.select().from(stoppageItems).where(and(eq(stoppageItems.tenantId, tenantId), inArray(stoppageItems.stoppageId, part))));
    const [latest] = await this.db.select({ id: stoppageImports.id }).from(stoppageImports).where(eq(stoppageImports.tenantId, tenantId)).orderBy(desc(stoppageImports.importedAt)).limit(1);
    return rows.map(({ s, followUpName, admissionNo }) => toSummary(s, its.filter((i) => i.stoppageId === s.id), followUpName, admissionNo, latest?.id ?? null, now))
      .sort((a, b) => (b.daysStopped ?? -1) - (a.daysStopped ?? -1) || a.noticeNo.localeCompare(b.noticeNo));
  }

  async list(actor: Actor, view: StoppageListKind, q?: string): Promise<StoppageListView> {
    const all = await this.summaries(actor);
    const buckets: Record<StoppageListKind, StoppageSummary[]> = {
      active: all.filter((s) => s.active),
      review: all.filter((s) => s.active && s.review.length),
      archive: all.filter((s) => !s.active),
    };
    const needle = q ? headerKey(q).toUpperCase() : '';
    const items = buckets[view].filter((s) => !needle || [s.noticeNo, s.chassis, s.ownerName ?? '', s.reception?.admissionNo ?? ''].some((v) => headerKey(v).toUpperCase().includes(needle)));
    const lastImport = await this.lastImport(actor.user.tenantId);
    return {
      view, items,
      counts: { active: buckets.active.length, review: buckets.review.length, archive: buckets.archive.length },
      lastImport, stale: !lastImport || Date.now() - Date.parse(lastImport.at) > STALE_MS,
    };
  }

  async byId(actor: Actor, id: string): Promise<StoppageCaseView> {
    const tenantId = actor.user.tenantId;
    const [summary] = await this.summaries(actor, eq(stoppages.id, id));
    if (!summary) throw notFound('خودروی متوقف');
    const [s] = await this.db.select().from(stoppages).where(and(eq(stoppages.tenantId, tenantId), eq(stoppages.id, id)));
    const its = await this.db.select().from(stoppageItems).where(and(eq(stoppageItems.tenantId, tenantId), eq(stoppageItems.stoppageId, id)));
    const itemIds = its.map((i) => i.id);
    const versions = itemIds.length ? await this.db.select({ v: stoppageItemVersions, fileName: stoppageImports.fileName }).from(stoppageItemVersions)
      .innerJoin(stoppageImports, eq(stoppageImports.id, stoppageItemVersions.importId))
      .where(and(eq(stoppageItemVersions.tenantId, tenantId), inArray(stoppageItemVersions.itemId, itemIds))).orderBy(stoppageItemVersions.observedAt) : [];
    const aidIds = its.map((i) => i.emdadRequestId).filter((x): x is string => !!x);
    const aid = aidIds.length ? await this.db.select({ id: emdadRequests.id, emdadNo: emdadRequests.emdadNo, statusCategory: emdadRequests.statusCategory, official: emdadRequests.official })
      .from(emdadRequests).where(and(eq(emdadRequests.tenantId, tenantId), inArray(emdadRequests.id, aidIds))) : [];
    const [latest] = await this.db.select({ id: stoppageImports.id }).from(stoppageImports).where(eq(stoppageImports.tenantId, tenantId)).orderBy(desc(stoppageImports.importedAt)).limit(1);
    const candidates = await this.db.select({ id: receptions.id, admissionNo: receptions.admissionNo, admittedAt: receptions.admittedAt, releasedAt: receptions.releasedAt, isOpen: receptions.isOpen })
      .from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(sql`upper(${receptions.chassis})`, s!.chassis))).orderBy(desc(receptions.admittedAt)).limit(10);
    const official = s!.official;
    const history: StoppageCaseView['history'] = [];
    const prev = new Map<string, StoppageOfficial>();
    for (const { v, fileName } of versions) {
      const before = prev.get(v.itemId);
      const after = v.official as StoppageOfficial;
      const changes = before ? STOPPAGE_FIELDS.filter((f) => before[f] !== after[f]).map((f) => `${STOPPAGE_COLUMNS[f]}: «${before[f] || '—'}» ← «${after[f] || '—'}»`) : ['اولین بار در گزارش دیده شد'];
      prev.set(v.itemId, after);
      history.push({ at: v.observedAt.toISOString(), fileName, rowKey: `${after.referenceNo} · ${after.partName || after.reason}`, changes });
    }
    const pii = actor.user.permissions.has('customer.pii.read');
    const itemsList: StoppageItemView[] = its.map((i) => {
      const o = i.official as StoppageOfficial;
      const a = aid.find((x) => x.id === i.emdadRequestId);
      return {
        id: i.id, referenceNo: o.referenceNo, partCode: o.partCode || null, partName: o.partName || null,
        reason: o.reason, reasonKind: stoppageReasonKind(o.reason), status: o.status, statusKnown: isKnownStoppageStatus(o.status),
        active: i.active, stage: i.stage as StoppageStage,
        stoppedAt: stoppageStartedAt([o])?.toISOString() ?? null,
        dates: { created: o.createdDate || null, office: o.officeDate || null, hq: o.hqDate || null, ended: o.endDate || null, rejected: o.rejectDate || null },
        daysOfficial: /^\d+$/.test(o.daysOfficial) ? Number(o.daysOfficial) : null, dealerDelay: o.dealerDelay || null,
        notes: i.notes, inLastFile: i.lastImportId === latest?.id,
        specialAid: i.aidLink ? { link: i.aidLink as StoppageAidLink, requestId: i.emdadRequestId, emdadNo: a?.emdadNo ?? o.referenceNo, status: a ? EMDAD_STATUS_CATEGORY_LABELS[a.statusCategory as EmdadStatusCategory] ?? a.statusCategory : null, arrived: i.stage === 'part_arrived' } : null,
        versions: versions.filter((x) => x.v.itemId === i.id).length,
      };
    }).sort((a, b) => Number(b.active) - Number(a.active) || (a.stoppedAt ?? '').localeCompare(b.stoppedAt ?? ''));
    return {
      ...summary,
      vehicleType: official.vehicleType || null, km: official.km || null, cardStatus: official.cardStatus || null,
      ownerPhone: pii ? official.ownerPhone || null : maskPhone(official.ownerPhone || null),
      itemsList,
      candidates: candidates.map((c) => ({ id: c.id, admissionNo: c.admissionNo, admittedAt: c.admittedAt?.toISOString() ?? null, releasedAt: c.releasedAt?.toISOString() ?? null, isOpen: c.isOpen })),
      history: history.reverse(),
    };
  }

  async report(actor: Actor, now = new Date()): Promise<StoppageReport> {
    const tenantId = actor.user.tenantId;
    const active = await this.summaries(actor, eq(stoppages.active, true), now);
    const days = active.map((s) => s.daysStopped).filter((d): d is number => d !== null);
    const [list] = await this.db.select().from(nightLists).where(eq(nightLists.tenantId, tenantId)).orderBy(desc(nightLists.day)).limit(1);
    let night = new Set<string>();
    if (list?.approvedSnapshot) night = new Set(list.approvedSnapshot.rows.map((r: NightListView['rows'][number]) => r.receptionId));
    else if (list) {
      const rows = await this.db.select({ receptionId: nightListItems.receptionId, correction: nightListItems.correction }).from(nightListItems)
        .where(and(eq(nightListItems.tenantId, tenantId), eq(nightListItems.listId, list.id)));
      night = new Set(rows.filter((r) => r.correction?.present !== false).map((r) => r.receptionId));
    }
    const both = active.filter((s) => s.reception && night.has(s.reception.id)).length;
    const lastImport = await this.lastImport(tenantId);
    return {
      at: now.toISOString(), lastImport, stale: !lastImport || now.getTime() - Date.parse(lastImport.at) > STALE_MS,
      active: active.length,
      avgDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      maxDays: days.length ? Math.max(...days) : null,
      byReason: STOPPAGE_REASON_KINDS.map((kind) => ({ kind, label: STOPPAGE_REASON_LABELS[kind], count: active.filter((s) => s.reasons.includes(kind)).length })),
      byStage: [...STOPPAGE_STAGES.filter((x) => x !== 'ended'), 'rejected' as const].map((stage) => ({ stage, label: STOPPAGE_STAGE_LABELS[stage], count: active.filter((s) => s.stage === stage).length })),
      ageing: STOPPAGE_AGE_BUCKETS.map((b, i) => ({ key: b.key, label: b.label, count: active.filter((s) => s.daysStopped !== null && s.daysStopped <= b.max && (i === 0 || s.daysStopped > STOPPAGE_AGE_BUCKETS[i - 1]!.max)).length })),
      overlap: { day: list?.day ?? null, both, officialOnly: active.length - both, nightOnly: Math.max(0, night.size - both) },
      longest: active.slice(0, 10),
    };
  }

  /** People who may follow a stopped vehicle (effective `stoppage.manage`). */
  async followers(actor: Actor) {
    const tenantId = actor.user.tenantId;
    const [t] = await this.db.select({ templates: tenants.permissionTemplates }).from(tenants).where(eq(tenants.id, tenantId));
    const people = await this.db.select({ id: users.id, displayName: users.displayName, roles: users.roles, overrides: users.permissionOverrides, isOwner: users.isOwner })
      .from(users).where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));
    return people.filter((u) => permissionsFor(u.roles as Role[], t?.templates, u.overrides, u.isOwner).has('stoppage.manage'))
      .map((u) => ({ id: u.id, displayName: u.displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName, 'fa'));
  }

  // ------------------------------------------------------------------ changes

  async setFollowUp(actor: Actor, id: string, input: StoppageOwnerInput) {
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      const [s] = await tx.select().from(stoppages).where(and(eq(stoppages.tenantId, tenantId), eq(stoppages.id, id))).for('update');
      if (!s) throw notFound('خودروی متوقف');
      if (s.version !== input.expectedVersion) throw versionConflict(s.version);
      if (input.ownerUserId) {
        const [u] = await tx.select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.id, input.ownerUserId), eq(users.isActive, true)));
        if (!u) throw badRequest('STOPPAGE_FOLLOWER', 'این همکار پیدا نشد یا غیرفعال است.');
      }
      await tx.update(stoppages).set({ followUpUserId: input.ownerUserId, updatedAt: new Date(), version: s.version + 1 }).where(and(eq(stoppages.tenantId, tenantId), eq(stoppages.id, id)));
      await this.audit.record(tx, actor, { entityType: 'stoppage', entityId: id, action: 'stoppage.follow_up_set', before: { followUpUserId: s.followUpUserId }, after: { followUpUserId: input.ownerUserId } });
    });
    return this.byId(actor, id);
  }

  /** Manual reception decision with a reason; an import never changes it afterwards. */
  async link(actor: Actor, id: string, input: StoppageLinkInput) {
    const tenantId = actor.user.tenantId;
    await this.db.transaction(async (tx) => {
      const [s] = await tx.select().from(stoppages).where(and(eq(stoppages.tenantId, tenantId), eq(stoppages.id, id))).for('update');
      if (!s) throw notFound('خودروی متوقف');
      if (s.version !== input.expectedVersion) throw versionConflict(s.version);
      if (input.receptionId) {
        const [r] = await tx.select({ chassis: receptions.chassis }).from(receptions).where(and(eq(receptions.tenantId, tenantId), eq(receptions.id, input.receptionId)));
        if (!r) throw notFound('پذیرش');
        if ((r.chassis ?? '').toUpperCase() !== s.chassis) throw badRequest('STOPPAGE_RECEPTION_CHASSIS', 'شاسی این پذیرش با شاسی خودروی متوقف یکی نیست.');
      }
      const linkState: StoppageLinkState = 'manual';
      await tx.update(stoppages).set({ receptionId: input.receptionId, linkState, linkNote: input.reason, updatedAt: new Date(), version: s.version + 1 }).where(and(eq(stoppages.tenantId, tenantId), eq(stoppages.id, id)));
      await this.audit.record(tx, actor, { entityType: 'stoppage', entityId: id, action: 'stoppage.reception_linked', before: { receptionId: s.receptionId, linkState: s.linkState }, after: { receptionId: input.receptionId, linkState, reason: input.reason } });
    });
    return this.byId(actor, id);
  }
}

function groupRows(rows: ParsedStoppageRow[]) {
  const groups = new Map<string, ParsedStoppageRow[]>();
  for (const r of rows) groups.set(r.official.noticeNo, [...(groups.get(r.official.noticeNo) ?? []), r]);
  return groups;
}

function toSummary(s: StoppageRow, its: ItemRow[], followUpName: string | null, admissionNo: string | null, latestImport: string | null, now: Date): StoppageSummary {
  const o = s.official;
  const officials = its.map((i) => i.official as StoppageOfficial);
  const review: string[] = [];
  if (s.active && s.linkState === 'ambiguous') review.push('چند پذیرش با همین شاسی در بازهٔ توقف هست؛ پذیرش درست را انتخاب کنید');
  if (s.active && s.linkState === 'none') review.push('پذیرشی با این شاسی در بازهٔ توقف پیدا نشد');
  for (const i of its) {
    const x = i.official as StoppageOfficial;
    if (!i.active) continue;
    if (i.aidLink === 'not_found') review.push(`امداد ویژهٔ ${x.referenceNo} در گزارش امداد ویژهٔ منیج پیدا نشد`);
    if (i.aidLink === 'ambiguous') review.push(`چند ردیف امداد ویژه با شمارهٔ ${x.referenceNo} هست`);
    review.push(...i.notes);
  }
  const official = officials.find((x) => /^\d+$/.test(x.daysOfficial));
  return {
    id: s.id, noticeNo: s.noticeNo, chassis: s.chassis,
    vehicleName: shortVehicleName(null, o.vehicleType || null),
    ownerName: o.ownerName || null,
    active: s.active, stage: s.stage as StoppageStage,
    daysStopped: s.stoppedAt ? daysBetween(s.stoppedAt, s.endedAt ?? now) : null,
    daysOfficial: official ? Number(official.daysOfficial) : null,
    stoppedAt: s.stoppedAt?.toISOString() ?? null, endedAt: s.endedAt?.toISOString() ?? null,
    reasons: STOPPAGE_REASON_KINDS.filter((k) => officials.some((x) => stoppageReasonKind(x.reason) === k)),
    items: its.length, activeItems: its.filter((i) => i.active).length,
    followUpUserId: s.followUpUserId, followUpName,
    reception: s.receptionId ? { id: s.receptionId, admissionNo } : null,
    linkState: s.linkState as StoppageLinkState,
    review: [...new Set(review)],
    inLastFile: s.lastImportId === latestImport,
    lastSeenAt: s.updatedAt.toISOString(),
    version: s.version,
  };
}
