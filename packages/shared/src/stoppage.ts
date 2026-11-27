import { z } from 'zod';
import { parseJalali } from './jalali';
import { normalizePersian, toLatinDigits } from './text';

// «گزارش توقف خودرو» of کسب‌وکار (بازرگانی ← گزارش ← گزارشات انبار ← گزارش توقف خودرو), the
// official source of stopped vehicles (owner, 2026-11-26; reconstruction step 1A). Excel export,
// sheet «توقف خودرو», 22 fixed columns, one row per item of a stoppage. Row key = notice number +
// reference number + part code. A stoppage (the rows of one notice number) is active while any
// row's «وضعیت توقف» is not «خاتمه». A row missing from a later file keeps its last known state.

export const STOPPAGE_SHEET = 'توقف خودرو';
export const STOPPAGE_MAX_BYTES = 5 * 1024 * 1024;
export const STOPPAGE_PARSER_VERSION = 1;

export const STOPPAGE_COLUMNS = {
  noticeNo: 'شماره اعلام توقف خودرو',
  chassis: 'شاسی خودرو',
  date: 'تاریخ',
  cardStatus: 'وضعیت',
  ownerName: 'نام مالک',
  ownerPhone: 'تلفن مالک',
  km: 'کیلومتر کارکرد',
  vehicleType: 'نوع خودرو',
  reason: 'شرح علت',
  partCode: 'کد اختصاصی',
  partName: 'شرح اختصاصی',
  daysOfficial: 'مدت توقف (روز)',
  referenceNo: 'شماره مرجع',
  stopDate: 'تاریخ توقف',
  stopTime: 'ساعت توقف',
  status: 'وضعیت توقف',
  dealerDelay: 'تاخیر نمایندگی',
  createdDate: 'تاریخ ایجاد',
  officeDate: 'تاریخ ارسال به دفتر',
  hqDate: 'تاریخ ارسال به ستاد',
  endDate: 'تاریخ خاتمه',
  rejectDate: 'تاریخ رد',
} as const;
export type StoppageField = keyof typeof STOPPAGE_COLUMNS;
export const STOPPAGE_FIELDS = Object.keys(STOPPAGE_COLUMNS) as StoppageField[];

/** Official values of one row after normalization (Arabic ي/ك → ی/ک, ASCII digits, trimmed). Empty cells are ''. */
export type StoppageOfficial = Record<StoppageField, string>;

/**
 * Text normalization for every Nexus import of this report: Arabic yeh/kaf to Persian, digits to
 * ASCII, whitespace collapsed. Zero-width non-joiners are kept (unlike the search key).
 */
export function normalizeSourceText(value: string | null | undefined): string {
  return toLatinDigits(value ?? '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Header comparison ignores spacing, ZWNJ and Arabic/Persian letter variants. */
export const headerKey = (h: string) => normalizePersian(h).replace(/\s+/g, '');

/**
 * Integer kept as text. Spreadsheet number cells may arrive as «949661.0» or «1.40500859343E11»;
 * both are written back as plain digits when the value is an exact integer. Anything else is kept
 * as it came (never rounded or trimmed).
 */
export function integerText(value: string): string {
  const v = value.trim();
  if (/^\d+$/.test(v)) return v;
  if (/^\d+\.0+$/.test(v)) return v.replace(/\.0+$/, '');
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(v)) {
    const n = Number(v);
    if (Number.isSafeInteger(n)) return String(n);
  }
  return v;
}

export const STOPPAGE_REASON_KINDS = ['permit_office', 'permit_hq', 'special_aid', 'other'] as const;
export type StoppageReasonKind = (typeof STOPPAGE_REASON_KINDS)[number];
export const STOPPAGE_REASON_LABELS: Record<StoppageReasonKind, string> = {
  permit_office: 'مجوز گارانتی از دفتر',
  permit_hq: 'مجوز گارانتی از ستاد',
  special_aid: 'امداد ویژه',
  other: 'سایر علت‌ها',
};
export function stoppageReasonKind(reason: string): StoppageReasonKind {
  const k = headerKey(reason);
  if (k === headerKey('امدادویژه')) return 'special_aid';
  if (k === headerKey('دریافت مجوز گارانتی ازدفتر')) return 'permit_office';
  if (k === headerKey('دریافت مجوز گارانتی ازستاد')) return 'permit_hq';
  return 'other';
}

/** «وضعیت توقف» values seen in real exports. Any other value is kept as text and flagged for review. */
export const STOPPAGE_ENDED_STATUS = 'خاتمه';
export const STOPPAGE_KNOWN_STATUSES = [STOPPAGE_ENDED_STATUS, 'ارسال به ستاد'] as const;
export const isKnownStoppageStatus = (s: string) => (STOPPAGE_KNOWN_STATUSES as readonly string[]).includes(normalizeSourceText(s));

/** Stages of the locked stepper of a stoppage item, in order. «rejected» is a separate end. */
export const STOPPAGE_STAGES = ['created', 'sent_office', 'sent_hq', 'part_arrived', 'ended'] as const;
export type StoppageStage = (typeof STOPPAGE_STAGES)[number] | 'rejected';
export const STOPPAGE_STAGE_LABELS: Record<StoppageStage, string> = {
  created: 'ثبت توقف',
  sent_office: 'ارسال به دفتر',
  sent_hq: 'ارسال به ستاد',
  part_arrived: 'مجوز / رسیدن قطعهٔ امداد',
  ended: 'خاتمه',
  rejected: 'رد شده',
};

/**
 * Stage of one item from its official dates and status. «part_arrived» needs the linked special
 * aid request to be in the dealer's stock (the caller knows that); a permit item goes straight from
 * the office or HQ to «خاتمه», which is when the permit was granted.
 */
export function stoppageItemStage(o: Pick<StoppageOfficial, 'status' | 'officeDate' | 'hqDate' | 'endDate' | 'rejectDate'>, partArrived = false): StoppageStage {
  if (o.rejectDate) return 'rejected';
  if (normalizeSourceText(o.status) === STOPPAGE_ENDED_STATUS) return 'ended';
  if (partArrived) return 'part_arrived';
  if (o.hqDate) return 'sent_hq';
  if (o.officeDate) return 'sent_office';
  return 'created';
}
export const stoppageItemActive = (o: Pick<StoppageOfficial, 'status'>) => normalizeSourceText(o.status) !== STOPPAGE_ENDED_STATUS;

/** Least advanced stage among the still active items: the one holding the vehicle. */
export function stoppageStage(items: { stage: StoppageStage; active: boolean }[]): StoppageStage {
  const open = items.filter((i) => i.active);
  if (!open.length) return items.length && items.every((i) => i.stage === 'rejected') ? 'rejected' : 'ended';
  const order = (s: StoppageStage) => (s === 'rejected' ? STOPPAGE_STAGES.length : STOPPAGE_STAGES.indexOf(s));
  return open.reduce((min, i) => (order(i.stage) < order(min) ? i.stage : min), open[0]!.stage);
}

export const stoppageRowKey = (o: Pick<StoppageOfficial, 'noticeNo' | 'referenceNo' | 'partCode'>) => `${o.noticeNo}|${o.referenceNo}|${o.partCode}`;

export interface StoppageRowIssue { row: number; message: string }
export interface ParsedStoppageRow { row: number; key: string; official: StoppageOfficial; notes: string[] }
export interface ParsedStoppageSheet {
  rows: ParsedStoppageRow[];
  errors: StoppageRowIssue[];
  /** File-level warnings (shown before applying); `headerProblem` blocks the import. */
  warnings: string[];
  headerProblem: string | null;
}

/**
 * Reads the grid of the «توقف خودرو» sheet (header on the first non-empty row). Blocks a file whose
 * columns differ from the 22 known ones; keeps every key as text; never fills or trims a code.
 */
export function parseStoppageGrid(grid: string[][], sheetName: string | null): ParsedStoppageSheet {
  const warnings: string[] = [];
  const errors: StoppageRowIssue[] = [];
  if (sheetName !== null && headerKey(sheetName) !== headerKey(STOPPAGE_SHEET)) warnings.push(`برگهٔ «${STOPPAGE_SHEET}» پیدا نشد؛ برگهٔ «${sheetName || 'اول'}» خوانده شد.`);
  const headerAt = grid.findIndex((r) => r.some((c) => c.trim()));
  const header = headerAt >= 0 ? grid[headerAt]!.map((c) => headerKey(c)) : [];
  const expected = STOPPAGE_FIELDS.map((f) => headerKey(STOPPAGE_COLUMNS[f]));
  const missing = STOPPAGE_FIELDS.filter((f, i) => !header.includes(expected[i]!)).map((f) => STOPPAGE_COLUMNS[f]);
  const extra = header.filter((h) => h && !expected.includes(h)).length;
  if (missing.length) {
    return { rows: [], errors, warnings, headerProblem: `ستون‌های فایل با «گزارش توقف خودرو» یکی نیست؛ ستون‌های نبود: ${missing.join('، ')}. فایل ثبت نشد.` };
  }
  if (extra) warnings.push(`${extra} ستون اضافه در فایل هست و خوانده نمی‌شود.`);
  const index = Object.fromEntries(STOPPAGE_FIELDS.map((f, i) => [f, header.indexOf(expected[i]!)])) as Record<StoppageField, number>;
  const rows: ParsedStoppageRow[] = [];
  const seen = new Map<string, number>();
  for (let r = headerAt + 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    if (!cells.some((c) => c && c.trim())) continue;
    const rowNo = r + 1;
    const official = Object.fromEntries(STOPPAGE_FIELDS.map((f) => [f, normalizeSourceText(cells[index[f]] ?? '')])) as StoppageOfficial;
    // A repeated header (page break in some exports) is not data.
    if (headerKey(official.noticeNo) === expected[0]) continue;
    for (const f of ['noticeNo', 'referenceNo', 'km', 'daysOfficial'] as const) official[f] = integerText(official[f]);
    official.chassis = official.chassis.replace(/\s+/g, '').toUpperCase();
    const notes: string[] = [];
    if (!/^\d+$/.test(official.noticeNo)) { errors.push({ row: rowNo, message: 'شمارهٔ اعلام توقف خالی یا نامعتبر است' }); continue; }
    if (!official.chassis) { errors.push({ row: rowNo, message: 'شاسی خودرو خالی است' }); continue; }
    if (official.partCode && /^\d+$/.test(official.partCode) && official.partCode.length < 8) notes.push('کد اختصاصی کوتاه‌تر از ۸ رقم است؛ شاید صفرهای ابتدای آن در فایل حذف شده باشد');
    if (official.status && !isKnownStoppageStatus(official.status)) notes.push(`وضعیت توقف «${official.status}» ناشناخته است`);
    if (!official.status) notes.push('وضعیت توقف خالی است');
    for (const f of ['date', 'stopDate', 'createdDate', 'officeDate', 'hqDate', 'endDate', 'rejectDate'] as const) {
      if (official[f] && !parseJalali(official[f])) notes.push(`«${STOPPAGE_COLUMNS[f]}» تاریخ معتبر شمسی نیست`);
    }
    const key = stoppageRowKey(official);
    const earlier = seen.get(key);
    if (earlier !== undefined) { errors.push({ row: rowNo, message: `ردیف تکراری (همان شمارهٔ اعلام، شمارهٔ مرجع و کد اختصاصیِ ردیف ${earlier})` }); continue; }
    seen.set(key, rowNo);
    rows.push({ row: rowNo, key, official, notes });
  }
  if (!rows.length && !errors.length) warnings.push('فایل هیچ ردیفی ندارد.');
  return { rows, errors, warnings, headerProblem: null };
}

/** Earliest stop instant of the items (Tehran time of «تاریخ توقف» + «ساعت توقف»). */
export function stoppageStartedAt(items: Pick<StoppageOfficial, 'stopDate' | 'stopTime' | 'createdDate'>[]): Date | null {
  let min: Date | null = null;
  for (const o of items) {
    const at = parseJalali(o.stopDate || o.createdDate, /^\d{1,2}:\d{2}$/.test(o.stopTime) ? o.stopTime : '00:00');
    if (at && (!min || at < min)) min = at;
  }
  return min;
}


export const STOPPAGE_AGE_BUCKETS = [
  { key: 'd0_3', label: '۰ تا ۳ روز', max: 3 },
  { key: 'd4_7', label: '۴ تا ۷ روز', max: 7 },
  { key: 'd8_14', label: '۸ تا ۱۴ روز', max: 14 },
  { key: 'd15_30', label: '۱۵ تا ۳۰ روز', max: 30 },
  { key: 'd31', label: 'بیش از ۳۰ روز', max: Infinity },
] as const;

// ---------------------------------------------------------------- API contracts

export const STOPPAGE_VIEWS = ['active', 'review', 'archive'] as const;
export type StoppageListKind = (typeof STOPPAGE_VIEWS)[number];
export const stoppageListQuerySchema = z.object({ view: z.enum(STOPPAGE_VIEWS).default('active'), q: z.string().trim().max(40).optional() }).strict();

export const stoppageImportQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  /** Apply: the SHA-256 of the previewed file. Without it the call only previews. */
  confirm: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** Apply despite the warnings shown in the preview (row-count drop, unknown values). */
  acceptWarnings: z.enum(['true', 'false']).optional(),
}).strict();

/** Add or remove one follower of a stopped vehicle (hotfix H1): any active Manage user, several allowed. */
export const stoppageFollowerSchema = z.object({ expectedVersion: z.number().int().min(1), userId: z.uuid(), action: z.enum(['add', 'remove']) }).strict();
export type StoppageFollowerInput = z.infer<typeof stoppageFollowerSchema>;
export interface StoppageFollower { userId: string; name: string }

export const stoppageLinkSchema = z.object({
  expectedVersion: z.number().int().min(1),
  receptionId: z.uuid().nullable(),
  reason: z.string().trim().min(3).max(300),
}).strict();
export type StoppageLinkInput = z.infer<typeof stoppageLinkSchema>;

export type StoppageLinkState = 'none' | 'linked' | 'ambiguous' | 'manual';
export type StoppageAidLink = 'linked' | 'ambiguous' | 'not_found';

export interface StoppageImportPreview {
  fileHash: string;
  fileName: string;
  /** This exact file was already applied: applying again changes nothing. */
  duplicate: boolean;
  rows: number;
  stoppages: number;
  activeStoppages: number;
  newRows: number;
  changedRows: number;
  unchangedRows: number;
  /** Rows Manage knows that are not in this file (kept with their last state). */
  missingFromFile: number;
  errors: StoppageRowIssue[];
  rowNotes: StoppageRowIssue[];
  warnings: string[];
  /** The file cannot be applied (changed columns, nothing readable, not an .xlsx). */
  blocked: string | null;
  /** Warnings that need «با وجود هشدار ثبت شود». */
  needsAcceptance: boolean;
}
export interface StoppageImportResult { importId: string; duplicate: boolean; preview: StoppageImportPreview }

export interface StoppageLastImport { at: string; fileName: string; rows: number; byName: string | null }

export interface StoppageSummary {
  id: string;
  noticeNo: string;
  chassis: string;
  vehicleName: string;
  ownerName: string | null;
  active: boolean;
  stage: StoppageStage;
  /** Days since the earliest stop of the notice, to today or to the end (null: no valid date). */
  daysStopped: number | null;
  daysOfficial: number | null;
  stoppedAt: string | null;
  endedAt: string | null;
  reasons: StoppageReasonKind[];
  items: number;
  activeItems: number;
  /** People following this stoppage, in the order they were added. */
  followers: StoppageFollower[];
  reception: { id: string; admissionNo: string | null } | null;
  linkState: StoppageLinkState;
  /** Why this stoppage needs a person's look (empty: nothing to review). */
  review: string[];
  /** Present in the last applied file. */
  inLastFile: boolean;
  lastSeenAt: string;
  version: number;
}

export interface StoppageItemView {
  id: string;
  referenceNo: string;
  partCode: string | null;
  partName: string | null;
  reason: string;
  reasonKind: StoppageReasonKind;
  status: string;
  statusKnown: boolean;
  active: boolean;
  stage: StoppageStage;
  stoppedAt: string | null;
  dates: { created: string | null; office: string | null; hq: string | null; ended: string | null; rejected: string | null };
  daysOfficial: number | null;
  dealerDelay: string | null;
  notes: string[];
  inLastFile: boolean;
  specialAid: { link: StoppageAidLink; requestId: string | null; emdadNo: string | null; status: string | null; arrived: boolean } | null;
  versions: number;
}

export interface StoppageCaseView extends StoppageSummary {
  vehicleType: string | null;
  km: string | null;
  ownerPhone: string | null;
  cardStatus: string | null;
  itemsList: StoppageItemView[];
  candidates: { id: string; admissionNo: string | null; admittedAt: string | null; releasedAt: string | null; isOpen: boolean }[];
  history: { at: string; fileName: string; rowKey: string; changes: string[] }[];
}

export interface StoppageListView {
  view: StoppageListKind;
  items: StoppageSummary[];
  counts: Record<StoppageListKind, number>;
  lastImport: StoppageLastImport | null;
  /** Working days since the last import > 1: the list may be behind کسب‌وکار. */
  stale: boolean;
}

export interface StoppageReport {
  at: string;
  lastImport: StoppageLastImport | null;
  stale: boolean;
  active: number;
  avgDays: number | null;
  maxDays: number | null;
  byReason: { kind: StoppageReasonKind; label: string; count: number }[];
  byStage: { stage: StoppageStage; label: string; count: number }[];
  ageing: { key: string; label: string; count: number }[];
  /** Comparison with the latest night list (by linked reception). */
  overlap: { day: string | null; both: number; officialOnly: number; nightOnly: number };
  longest: StoppageSummary[];
}
