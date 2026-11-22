import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';
import {
  REPORT_CENTER_DEFAULTS, REPORT_CENTER_KINDS, REPORT_STALE_WORKING_DAYS, headerSignature, isWorkingDay, tehranDay,
  type ReportCenterEntry, type ReportCenterKind, type ReportCenterSaveInput, type ReportDetectResult, type SavedReferenceMapping,
} from '@manage/shared';
import { detectFormat } from '../daily-reports/spreadsheet-formats';
import { parseEmdadSheet, parseStockSheet } from '../daily-reports/report-rows';
import { readSheets } from '../reference-data/reference-data.service';
import { calendarAt } from '../workshop/work-calendar';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { badRequest, forbidden } from '../common/errors';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { dailyReportImports, dailyTasks, referenceImports, tenants } from '../db/schema';

type Stored = Partial<Record<ReportCenterKind, { guide?: string; pastDays?: number; futureDays?: number; updatedAt?: string }>>;
const DAY = 86_400_000;

/** «مرکز گزارش‌های کسب‌وکار» (spec section 25): guides, periods and import status of the three ISACO reports. */
@Injectable()
export class ReportCenterService {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle, private readonly audit: AuditService) {}
  private get db() { return this.handle.db; }
  private allowed(actor: Actor) {
    const p = actor.user.permissions;
    if (!(p.has('report_center.manage') || p.has('daily_reports.upload') || p.has('reference.customers.manage') || p.has('reference.appointments.manage'))) throw forbidden();
  }

  async list(actor: Actor): Promise<ReportCenterEntry[]> {
    this.allowed(actor);
    const tenantId = actor.user.tenantId;
    const [t] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
    const stored = ((t?.settings ?? {}) as { reportCenter?: Stored }).reportCenter ?? {};
    const [emdad] = await this.db.select().from(dailyReportImports).where(and(eq(dailyReportImports.tenantId, tenantId), eq(dailyReportImports.kind, 'emdad'), eq(dailyReportImports.status, 'applied'))).orderBy(desc(dailyReportImports.appliedAt)).limit(1);
    const lastRef = async (kind: 'customers' | 'appointments') => (await this.db.select({ fileName: referenceImports.fileName, appliedAt: referenceImports.appliedAt, rows: referenceImports.rows }).from(referenceImports).where(and(eq(referenceImports.tenantId, tenantId), eq(referenceImports.kind, kind), eq(referenceImports.status, 'applied'))).orderBy(desc(referenceImports.appliedAt)).limit(1))[0];
    const [reception, appointments] = await Promise.all([lastRef('customers'), lastRef('appointments')]);
    const saved = ((t?.settings ?? {}) as { referenceMappings?: Record<string, SavedReferenceMapping> }).referenceMappings ?? {};
    const calendar = (await calendarAt(this.db, tenantId, new Date().toISOString())).calendar;
    // Working days after the import day up to today (Friday and recorded holidays excluded).
    const age = (at: Date | null | undefined) => {
      if (!at) return null;
      let n = 0; const end = tehranDay(new Date());
      for (let d = new Date(Date.parse(tehranDay(at)) + DAY); n < 400 && d.toISOString().slice(0, 10) <= end; d = new Date(d.getTime() + DAY)) if (isWorkingDay(d.toISOString().slice(0, 10), calendar)) n += 1;
      return n;
    };
    // A missed day is a past daily task of the special-aid report that was never completed.
    const since = new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10);
    const today = new Date(Date.now() + 210 * 60_000).toISOString().slice(0, 10);
    const missed = await this.db.select({ day: dailyTasks.localDate }).from(dailyTasks).where(and(eq(dailyTasks.tenantId, tenantId), eq(dailyTasks.kind, 'emdad'), eq(dailyTasks.status, 'pending'), gte(dailyTasks.localDate, since)));
    return REPORT_CENTER_KINDS.map((kind) => {
      const s = stored[kind] ?? {};
      const base = REPORT_CENTER_DEFAULTS[kind];
      const counts = (emdad?.counts ?? {}) as Record<string, number>;
      const lastImport = kind === 'emdad' && emdad?.appliedAt
        ? { fileName: emdad.fileName, reportAt: emdad.reportAt?.toISOString() ?? null, appliedAt: emdad.appliedAt.toISOString(), rows: counts.total ?? null, errors: (counts.invalid ?? 0) + (counts.ambiguous ?? 0) + (counts.duplicate ?? 0) }
        : kind !== 'emdad' && (kind === 'reception' ? reception : appointments)?.appliedAt
          ? (({ fileName, appliedAt, rows }) => ({ fileName, reportAt: null, appliedAt: appliedAt!.toISOString(), rows: Array.isArray(rows) ? rows.length : null, errors: Array.isArray(rows) ? (rows as { outcome?: string }[]).filter((r) => r.outcome === 'error').length : null }))((kind === 'reception' ? reception : appointments)!)
          : null;
      const ageWorkingDays = age(lastImport ? new Date(lastImport.appliedAt) : null);
      return {
        ...base, kind, guide: s.guide ?? base.guide, pastDays: s.pastDays ?? base.pastDays, futureDays: s.futureDays ?? base.futureDays,
        supported: true, lastImport,
        missingDays: kind === 'emdad' ? missed.map((m) => m.day).filter((d) => d < today).sort() : [],
        updatedAt: s.updatedAt ?? null,
        ageWorkingDays, stale: ageWorkingDays == null || ageWorkingDays > REPORT_STALE_WORKING_DAYS[kind],
        layoutConfirmed: kind === 'emdad' ? !!emdad : !!saved[kind === 'reception' ? 'customers' : 'appointments'],
      };
    });
  }

  /**
   * Recognizes one file of the unified upload by its content: the special-aid and stock reports by
   * their own headers, reception and appointment lists by the layout confirmed on their first import.
   */
  async detect(actor: Actor, input: { fileName: string; fileBase64: string }): Promise<ReportDetectResult> {
    this.allowed(actor);
    const bytes = Buffer.from(input.fileBase64, 'base64');
    if (bytes.length > 5_000_000) throw badRequest('REPORT_FILE_LARGE', 'فایل باید کمتر از پنج مگابایت باشد');
    const format = detectFormat(bytes);
    let sheets: { name: string; rows: string[][] }[];
    try { sheets = readSheets(bytes); }
    catch (e) { return { kind: null, format, sheetIndex: null, headerRow: null, mapping: null, message: e instanceof Error ? e.message : 'فایل خوانده نشد' }; }
    const head = (i: number) => sheets[i]!.rows.slice(0, 40);
    for (let i = 0; i < sheets.length; i++) {
      try { parseEmdadSheet(head(i)); if (format === 'spreadsheetml') return { kind: 'emdad', format, sheetIndex: i, headerRow: null, mapping: null, message: 'گزارش امداد ویژه' }; } catch { /* not this report */ }
      try { const st = parseStockSheet(head(i)); if (!st.missingColumns.length) return { kind: 'stock', format, sheetIndex: i, headerRow: null, mapping: null, message: 'گزارش موجودی کسب‌وکار' }; } catch { /* not this report */ }
    }
    const [t] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, actor.user.tenantId));
    const saved = ((t?.settings ?? {}) as { referenceMappings?: Record<string, SavedReferenceMapping> }).referenceMappings ?? {};
    for (const kind of ['customers', 'appointments'] as const) {
      const m = saved[kind];
      if (!m) continue;
      const rows = sheets[m.sheetIndex]?.rows ?? [];
      for (let h = 0; h < Math.min(rows.length, 40); h++) {
        if (headerSignature(rows[h] ?? []) === m.signature) return { kind, format, sheetIndex: m.sheetIndex, headerRow: h + 1, mapping: m.mapping as Record<string, number>, message: kind === 'customers' ? 'سوابق پذیرش (تعمیرات خودرو)' : 'لیست نوبت پذیرش' };
      }
    }
    return { kind: null, format, sheetIndex: null, headerRow: null, mapping: null, message: 'ساختار این فایل هنوز شناخته نشده است. اگر «تعمیرات خودرو» یا «لیست نوبت پذیرش» است، یک‌بار ستون‌هایش را در «اطلاعات پایه» تأیید کنید؛ فایل‌های بعدی خودکار شناخته می‌شوند.' };
  }

  async save(actor: Actor, input: ReportCenterSaveInput) {
    if (!actor.user.permissions.has('report_center.manage')) throw forbidden();
    await this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, actor.user.tenantId)).for('update');
      const before = (t!.settings ?? {}) as Record<string, unknown> & { reportCenter?: Stored };
      const center: Stored = { ...(before.reportCenter ?? {}), [input.kind]: { guide: input.guide, pastDays: input.pastDays, futureDays: input.futureDays, updatedAt: new Date().toISOString() } };
      await tx.update(tenants).set({ settings: { ...before, reportCenter: center } }).where(eq(tenants.id, actor.user.tenantId));
      await this.audit.record(tx, actor, { entityType: 'tenant', entityId: actor.user.tenantId, action: 'settings.report_center_updated', before: { [input.kind]: before.reportCenter?.[input.kind] ?? null }, after: { [input.kind]: center[input.kind] } });
    });
    return this.list(actor);
  }
}
