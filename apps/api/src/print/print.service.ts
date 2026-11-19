import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import {
  STAGE_LABELS,
  deskFilterMatch,
  formatJalaliDateInput,
  isOemStockCode,
  toPersianDigits,
  wholeWorkingDays,
  workingDayMinutes,
  workingMinutesBetween,
  type DeskFilter,
  type Part,
} from '@manage/shared';
import type { Actor } from '../auth/auth.types';
import { CasesService } from '../cases/cases.service';
import { forbidden } from '../common/errors';
import { DATABASE, type DatabaseHandle } from '../db/database';
import { cases, stockReservations, stockSnapshotItems, vehicles } from '../db/schema';
import { DeskService } from '../desk/desk.service';
import { PartsService } from '../parts/parts.service';
import { renderChecklistPdf, type ChecklistRow } from '../reports/checklist-pdf';
import { calendarAt } from '../workshop/work-calendar';

/** Why a line is not on the picking walk (complete list only). */
function notPickable(p: Part): string {
  switch (p.flowState) {
    case 'handed_over':
    case 'consumed':
      return 'تحویل‌شده';
    case 'emdad':
    case 'emdad_arrived':
      return 'منتظر امداد ویژه';
    case 'dealer_supply':
      return 'امداد ویژه: تأمین توسط نمایندگی';
    case 'market':
      return 'خرید بازار · در راه';
    case 'ready':
      return 'رسیده از بازار · خارج از قفسه';
    case 'needed':
      return 'ناموجود / تعیین تکلیف نشده';
    default:
      return 'رزرو تکمیل نشده';
  }
}

/**
 * Read-only printable checklists (owner, 2026-11-18). They read current data from
 * the database at the moment of printing and never reserve, issue or change anything.
 */
@Injectable()
export class PrintService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly cases: CasesService,
    private readonly parts: PartsService,
    private readonly desk: DeskService,
  ) {}

  /**
   * «چک‌لیست برداشت قطعات از انبار»: one row per reserved stock item and location,
   * with the physical address of exactly that item. No address is invented; a
   * missing address stays blank. `all` adds the other lines, greyed and marked.
   */
  async picking(actor: Actor, caseId: string, scope: 'pick' | 'all', now = new Date()): Promise<{ data: Buffer; fileName: string }> {
    const { kase, rows, pickCount } = await this.pickingRows(actor, caseId, scope);
    const v = kase.vehicle;
    const vehicle = [v.brand, v.model, v.trim].filter(Boolean).join(' ') || 'خودرو';
    const data = await renderChecklistPdf({
      title: 'چک‌لیست برداشت قطعات از انبار',
      subtitle: scope === 'all' ? 'همهٔ قطعات خودرو؛ ردیف‌های خاکستری برداشت نمی‌شوند' : 'فقط قطعات رزروشده از موجودی برای همین خودرو',
      meta: [
        `خودرو: ${vehicle} · پلاک: ${v.plate ?? '—'} · پروندهٔ منیج: ${kase.caseNumber}${kase.admissionNo ? ` · پذیرش: ${kase.admissionNo}` : ''}`,
        `تهیه‌کننده: ${actor.user.displayName} · ${toPersianDigits(String(pickCount))} ردیف برداشت`,
      ],
      layout: 'portrait',
      columns: [
        { title: '✓', width: 4, align: 'center' },
        { title: 'ردیف', width: 4, align: 'center' },
        { title: 'نام قطعه', width: 25 },
        { title: 'کد فنی کامل', width: 18, latin: true },
        { title: 'تعداد', width: 6, align: 'center' },
        { title: 'آدرس قفسه', width: 13, latin: true },
        { title: 'توضیح', width: 18, latin: true },
      ],
      rows,
      minRowHeight: 24,
      emptyText: 'قطعهٔ رزروشده‌ای برای برداشت از انبار ثبت نشده است.',
      legend: 'آدرس قفسه از همان کالای انتخاب و رزروشده در گزارش موجودی خوانده می‌شود؛ خانهٔ خالی یعنی آدرس ثبت نشده است. چاپ این برگه چیزی را رزرو یا تحویل نمی‌کند.',
      signature: ['نام مسئول برداشت', 'تاریخ', 'امضا'],
      generatedAt: now,
    });
    return { data, fileName: `picking-${kase.caseNumber}.pdf` };
  }

  /** Rows of the picking list (exposed for tests): one per reserved item and location. */
  async pickingRows(actor: Actor, caseId: string, scope: 'pick' | 'all') {
    if (!actor.user.permissions.has('stock.read')) throw forbidden('چاپ لیست برداشت قطعات کار مسئول قطعات است');
    const kase = await this.cases.detail(actor, caseId);
    const list = await this.parts.list(actor, caseId);
    const db = this.handle.db;
    const tenantId = actor.user.tenantId;
    const held = await db
      .select({ r: stockReservations, text: stockSnapshotItems.locationText, itemName: stockSnapshotItems.description })
      .from(stockReservations)
      .leftJoin(stockSnapshotItems, and(eq(stockSnapshotItems.snapshotId, stockReservations.snapshotId), eq(stockSnapshotItems.fullStockCode, stockReservations.fullStockCode), eq(stockSnapshotItems.locationAddress, stockReservations.locationAddress)))
      .where(and(eq(stockReservations.tenantId, tenantId), eq(stockReservations.caseId, caseId), inArray(stockReservations.status, ['reserved'])));
    const byPart = new Map<string, typeof held>();
    for (const h of held) byPart.set(h.r.partRequestId, [...(byPart.get(h.r.partRequestId) ?? []), h]);

    const pick: { loc: string; row: ChecklistRow }[] = [];
    const other: ChecklistRow[] = [];
    for (const p of list) {
      if (['cancelled', 'returned'].includes(p.flowState)) continue;
      const mine = byPart.get(p.id) ?? [];
      for (const { r, text } of mine) {
        // The stored address of the selected item; its description only when the address itself is empty.
        const loc = (r.locationAddress || text || '').trim();
        const notes = [isOemStockCode(r.fullStockCode) ? 'شرکتی' : 'غیرشرکتی'];
        if (p.displayCode && p.displayCode.replace(/\s/g, '').toUpperCase() !== r.fullStockCode) notes.push(`کد درخواستی ${p.displayCode}`);
        if (p.flowState === 'stock_parallel') notes.push('امداد ویژه جداگانه پیگیری می‌شود');
        pick.push({ loc, row: { cells: ['', '', p.description, r.fullStockCode, String(Math.round(Number(r.quantity) * 1000) / 1000), loc, notes.join(' · ')] } });
      }
      if (scope === 'all' && !mine.length) other.push({ muted: true, cells: ['', '', p.description, p.displayCode ?? p.partNumber ?? '', String(p.quantity), '', `برداشت نشود — ${notPickable(p)}`] });
    }
    // Walk order: by shelf address (blank addresses last), then name.
    pick.sort((a, b) => (a.loc ? 0 : 1) - (b.loc ? 0 : 1) || a.loc.localeCompare(b.loc, 'en') || a.row.cells[2]!.localeCompare(b.row.cells[2]!, 'fa'));
    const rows: ChecklistRow[] = [...pick.map((x) => x.row), ...other].map((r, i) => ({ ...r, cells: r.cells.map((c, n) => (n === 1 ? String(i + 1) : c)) }));
    return { kase, rows, pickCount: pick.length };
  }

  /**
   * «چک‌لیست بازدید و پیگیری روزانهٔ خودروهای تصادفی»: every open accident case still in the
   * dealership (not delivered, not deleted), delayed first, then those with open issues.
   */
  async inspection(actor: Actor, filter: DeskFilter = 'all', now = new Date()): Promise<{ data: Buffer; fileName: string }> {
    const { rows, total, late } = await this.inspectionRows(actor, filter, now);
    const data = await renderChecklistPdf({
      title: 'چک‌لیست بازدید و پیگیری روزانهٔ خودروهای تصادفی',
      subtitle: 'خودروهای فعال داخل نمایندگی · دارای تأخیر و مسئلهٔ باز در ابتدای فهرست',
      meta: [`تعداد خودروها: ${toPersianDigits(String(total))}${late ? ` · دارای تأخیر: ${toPersianDigits(String(late))}` : ''} · مسئول تصادفات: ${actor.user.displayName} · نوبت بازدید: ................`],
      layout: 'landscape',
      columns: INSPECTION_COLUMNS,
      rows,
      minRowHeight: 34,
      emptyText: 'خودروی تصادفی فعالی در نمایندگی نیست.',
      legend: 'روز کاری = روزهای کاری کامل از پذیرش با تقویم نمایندگی (کسر روز صفر است). این برگه فقط‌خواندنی است و وضعیتی را تغییر نمی‌دهد.',
      signature: ['نام مسئول تصادفات', 'تاریخ بازدید', 'امضا'],
      generatedAt: now,
    });
    return { data, fileName: `inspection-${formatJalaliDateInput(now).replace(/\//g, '-')}.pdf` };
  }

  /** Rows of the inspection checklist (exposed for tests). */
  async inspectionRows(actor: Actor, filter: DeskFilter = 'all', now = new Date()) {
    const p = actor.user.permissions;
    if (!p.has('case.read') || !(p.has('case.update') || p.has('report.manager'))) throw forbidden('چاپ چک‌لیست بازدید برای کارشناس و مسئول تصادفات است');
    const folders = (await this.desk.folders(actor, now.getTime())).filter((f) => f.stage !== 'delivered' && deskFilterMatch(f, filter === 'mine' ? 'all' : filter, [], actor.user.id));
    const db = this.handle.db;
    const tenantId = actor.user.tenantId;
    const extra = folders.length
      ? await db.select({ id: cases.id, official: cases.officialDeadlineAt, forecast: cases.forecastDeliveryAt, location: cases.vehicleLocation, module: cases.module })
        .from(cases).innerJoin(vehicles, eq(vehicles.id, cases.vehicleId))
        .where(and(eq(cases.tenantId, tenantId), inArray(cases.id, folders.map((f) => f.caseId))))
      : [];
    const info = new Map(extra.map((e) => [e.id, e]));
    const cal = (await calendarAt(db, tenantId, now.toISOString())).calendar;
    const dayMinutes = workingDayMinutes(cal);
    const items = folders
      .filter((f) => (info.get(f.caseId)?.module ?? 'accident') === 'accident')
      .map((f) => {
        const e = info.get(f.caseId);
        const planned = e?.forecast ?? e?.official ?? null;
        const late = f.behind || (!!e?.official && e.official.getTime() < now.getTime());
        const issue = f.openBlockers > 0 || f.parts.undecided > 0 || f.parts.emdadLate > 0 || f.next.tone === 'stop';
        let days: number | null = null;
        try { days = wholeWorkingDays(workingMinutesBetween(f.admittedAt, now.toISOString(), cal), dayMinutes); } catch { days = null; }
        return { f, e, planned, late, issue, days };
      })
      .sort((a, b) => (a.late ? 0 : a.issue ? 1 : 2) - (b.late ? 0 : b.issue ? 1 : 2) || a.f.admittedAt.localeCompare(b.f.admittedAt) || a.f.caseNumber.localeCompare(b.f.caseNumber));
    const rows: ChecklistRow[] = items.map(({ f, e, planned, late, issue, days }, i) => {
      const flags = [late ? 'تأخیر' : '', f.openBlockers ? `${f.openBlockers} مانع` : '', f.parts.undecided ? `${f.parts.undecided} قطعه بی‌تکلیف` : '', f.parts.emdadLate ? 'امداد دیرشده' : ''].filter(Boolean);
      const stage = STAGE_LABELS[f.stage];
      return {
        // Only the vehicle's name/model (never the long manufacturer trim text) keeps rows short.
        cells: ['', String(i + 1), f.vehicle, f.plate ?? '', `${f.caseNumber}${f.admissionNo ? `\n${f.admissionNo}` : ''}`, stage, f.next.text, days == null ? '' : String(days), planned ? formatJalaliDateInput(planned) : '', flags.join('، ') || (issue ? 'نیاز به پیگیری' : '—'), ''],
        note: f.place && f.place !== stage ? { column: 5, text: f.place } : e?.location ? { column: 2, text: `محل خودرو: ${e.location}` } : undefined,
      };
    });
    const late = items.filter((x) => x.late).length;
    return { rows, total: items.length, late, items: items.map((x) => ({ caseId: x.f.caseId, late: x.late, issue: x.issue, days: x.days })) };
  }
}

const INSPECTION_COLUMNS = [
  { title: '✓', width: 3, align: 'center' as const },
  { title: 'ردیف', width: 3, align: 'center' as const },
  { title: 'خودرو', width: 12 },
  { title: 'پلاک', width: 10 },
  { title: 'پرونده / پذیرش', width: 10.5, latin: true },
  { title: 'مرحلهٔ فعلی', width: 10 },
  { title: 'وضعیت', width: 14 },
  { title: 'روز کاری', width: 4.5, align: 'center' as const },
  { title: 'پایان برنامه', width: 6.5, align: 'center' as const },
  { title: 'تأخیر / مسئله', width: 8 },
  { title: 'یادداشت بازدید', width: 18.5 },
];
