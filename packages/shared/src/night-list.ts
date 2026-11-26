// «لیست شب» — vehicles staying overnight (reconstruction scenario, owner 2026-11-25).
// Half an hour before the end of the working day (work calendar: 18:00 on a full day that ends at
// 18:30, 12:30 on a Thursday that ends at 13:00) Manage builds the list from the open receptions
// Pulse reads; the receptionist only picks the stay reason (and the stations while کسب‌وکار has no
// technician data); the reception supervisor sends it within 15 minutes after closing (18:45 /
// 13:15), otherwise the service manager is told. Warnings never block (spec section 2).
import type { WorkCalendar } from './workshop';
import { normalizeLaborCode } from './reception-stats';

/** Defaults of a full working day (ends 18:30); a day's real times come from `nightListTimes`. */
export const NIGHT_LIST_GENERATE_AT = '18:00';
export const NIGHT_LIST_DEADLINE = '18:45';
/** The list is built this many minutes before the end of the working day… */
export const NIGHT_LIST_LEAD_MINUTES = 30;
/** …and is due this many minutes after it. */
export const NIGHT_LIST_GRACE_MINUTES = 15;

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Build and send-by times of a Tehran day (YYYY-MM-DD) from the work calendar: the end of the day's
 * last working interval minus 30 minutes, and plus 15 minutes. Null when the weekday has no working
 * hours (Friday). Thursday with 08:00–13:00 → 12:30 and 13:15.
 */
export function nightListTimes(dateKey: string, calendar: WorkCalendar): { generateAt: string; deadline: string } | null {
  const weekday = new Date(dateKey + 'T12:00:00Z').getUTCDay();
  const end = Math.max(0, ...(calendar.week[weekday] ?? []).map((i) => i.end));
  if (!end) return null;
  return { generateAt: hhmm(Math.max(0, end - NIGHT_LIST_LEAD_MINUTES)), deadline: hhmm(Math.min(24 * 60 - 1, end + NIGHT_LIST_GRACE_MINUTES)) };
}

export const NIGHT_LIST_REASONS = [
  'waiting_parts',
  'waiting_special_aid',
  'station_load',
  'unfinished',
  'waiting_diagnosis',
  'waiting_customer_approval',
  'waiting_outside_work',
  'ready_customer_absent',
  'other',
] as const;
export type NightListReason = (typeof NIGHT_LIST_REASONS)[number];
export const NIGHT_LIST_REASON_LABELS: Record<NightListReason, string> = {
  waiting_parts: 'منتظر قطعه از انبار',
  waiting_special_aid: 'منتظر امداد ویژه',
  station_load: 'حجم کار جایگاه',
  unfinished: 'کار نیمه‌تمام',
  waiting_diagnosis: 'منتظر عیب‌یابی فنی',
  waiting_customer_approval: 'منتظر تأیید مشتری',
  waiting_outside_work: 'منتظر کار خارج از نمایندگی',
  ready_customer_absent: 'آمادهٔ تحویل (مشتری نیامده)',
  other: 'سایر',
};

export const NIGHT_LIST_STATUSES = ['draft', 'sent'] as const;
export type NightListStatus = (typeof NIGHT_LIST_STATUSES)[number];
export const NIGHT_LIST_STATUS_LABELS: Record<NightListStatus, string> = { draft: 'پیش‌نویس', sent: 'ارسال‌شده' };

export interface NightListRow {
  /** The list item; the reception is `receptionId`. */
  id: string;
  version: number;
  receptionId: string;
  admissionNo: string | null;
  plate: string | null;
  vehicleName: string | null;
  ownerName: string | null;
  /** Days in the dealership on the Tehran calendar, counting the admission day (1 = admitted today). */
  daysIn: number | null;
  /** Still open in کسب‌وکار now; a vehicle released after 18:00 stays on the list, marked. */
  isOpen: boolean;
  /** Linked to an accident case (the accident module keeps its own plan). */
  accident: boolean;
  /** Labour labels and states at the time the list is rendered or approved. */
  labour: string[];
  /** Missing on snapshots written before code matching was introduced. */
  unmatchedLabourCount?: number;
  currentStation: string | null;
  nextStations: string | null;
  reason: NightListReason | null;
  reasonNote: string | null;
  /** The reason was copied from the previous list (shown as «از دیروز» until someone changes or confirms it). */
  carried: boolean;
  setByName: string | null;
  setAt: string | null;
  correction?: { present: boolean; reason: string } | null;
}

export interface NightListView {
  id: string;
  /** Tehran calendar day, YYYY-MM-DD. */
  day: string;
  status: NightListStatus;
  version: number;
  generatedAt: string;
  sentAt: string | null;
  sentByName: string | null;
  /** Send-by time of the day (18:45 on a full day, 13:15 on a half-day Thursday). */
  deadline: string;
  late: boolean;
  missingReasons: number;
  unmatchedLabourCount: number | null;
  historicalIncomplete: boolean;
  excluded: NightListRow[];
  physicalVehicleCount: number | null;
  rows: NightListRow[];
  /** The nearest earlier / later day that has a list, for «لیست قبل» and «لیست بعد». */
  previousDay: string | null;
  nextDay: string | null;
}

export const UNKNOWN_LABOUR_NAME = 'نام اجرت در منبع مشخص نیست';
export const LABOUR_LETTER_PATTERN = '[ء-غف-يٮ-ٯٱ-ۓە]';
const labourLetter = new RegExp(LABOUR_LETTER_PATTERN, 'u');

export function officialLabourName(description: string | null, code: string | null): string {
  const name = description?.trim();
  return name && normalizeLaborCode(name) !== normalizeLaborCode(code ?? '') && labourLetter.test(name)
    ? name
    : UNKNOWN_LABOUR_NAME;
}

/** No list yet for the day (before its build time, or not a working day). */
export interface NightListPending {
  day: string;
  status: 'not_generated';
  generatesAt: string;
  workingDay: boolean;
  previousDay: string | null;
  nextDay: string | null;
}

/** Rows without a reason. A reason carried from the previous list counts as given (one click less per vehicle). */
export const nightListMissing = (rows: readonly Pick<NightListRow, 'reason'>[]) => rows.filter((r) => !r.reason).length;

/** Late once the deadline passed while the list is still a draft. */
export function nightListLate(status: NightListStatus, deadline: string | Date, now: Date): boolean {
  return status === 'draft' && now.getTime() >= new Date(deadline).getTime();
}

/** Ordering on the list: longest stay first, then admission number. */
export function compareNightRows(a: Pick<NightListRow, 'daysIn' | 'admissionNo'>, b: Pick<NightListRow, 'daysIn' | 'admissionNo'>): number {
  return (b.daysIn ?? -1) - (a.daysIn ?? -1) || (a.admissionNo ?? '').localeCompare(b.admissionNo ?? '', 'en', { numeric: true });
}

export const NIGHT_LIST_COLUMNS = ['نوع خودرو', 'پلاک', 'نام مالک', 'شماره پذیرش', 'روزهای ماندن', 'جایگاه فعلی', 'نام اجرت', 'جایگاه‌های بعدی', 'علت ماندن', 'توضیح', 'تصادفی', 'وضعیت فعلی'] as const;

/** Header and rows of the Excel export, in the column order of the scenario. */
export function nightListSheet(rows: readonly NightListRow[]): (string | number)[][] {
  return [
    [...NIGHT_LIST_COLUMNS],
    ...rows.map((r) => [
      r.vehicleName ?? '',
      r.plate ?? '',
      r.ownerName ?? '',
      r.admissionNo ?? '',
      r.daysIn ?? '',
      r.currentStation ?? '',
      r.labour.join(' · '),
      r.nextStations ?? '',
      r.reason ? NIGHT_LIST_REASON_LABELS[r.reason] + (r.carried ? ' (از دیروز)' : '') : 'ثبت نشده',
      r.reasonNote ?? '',
      r.accident ? 'بله' : '',
      r.isOpen ? 'باز' : 'ترخیص شد',
    ]),
  ];
}
