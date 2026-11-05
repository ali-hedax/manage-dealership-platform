import {
  normalizePersian,
  parseJalali,
  searchKey,
  toJalaliParts,
  toLatinDigits,
  type CaseStage,
  type CoverageType,
} from '@manage/shared';
import { readWorkbook, XlsxError, type Worksheet } from '../parts/xlsx';

// Reading the "existing vehicles" sheet (Manage_HEDAX_Existing_Vehicles_Intake).
// Pure functions: no database. The service decides what the parsed rows mean
// for existing cases. Original cell text is always kept for provenance.

export const VEHICLE_SHEET_NAME = 'لیست خودروها';

export type ColumnKey =
  | 'rowNo'
  | 'admissionNo'
  | 'admittedDate'
  | 'chassis'
  | 'model'
  | 'owner'
  | 'plate'
  | 'coverageText'
  | 'notes'
  | 'stage'
  | 'nextAction'
  | 'partsStatus'
  | 'blockingPart'
  | 'responsible'
  | 'unit'
  | 'deadlineDate'
  | 'blocker'
  | 'authStatus'
  | 'financeStatus'
  | 'lastFollowUp'
  | 'extraNote'
  | 'dataCheck'
  | 'coverageType'
  | 'caseNumber'
  | 'vin'
  | 'dupCheck'
  | 'admittedTime'
  | 'deadlineTime';

// Header prefixes as written in the template; matched after normalization so
// spacing, ZWNJ and Arabic/Persian letter variants do not matter.
const COLUMN_HEADERS: [ColumnKey, string][] = [
  ['rowNo', 'ردیف'],
  ['admissionNo', 'شماره کارت پذیرش'],
  ['admittedDate', 'تاریخ پذیرش'],
  ['chassis', 'شماره شاسی'],
  ['model', 'خودرو'],
  ['owner', 'نام مالک'],
  ['plate', 'پلاک'],
  ['coverageText', 'پوشش مندرج'],
  ['notes', 'توضیحات فعلی'],
  ['stage', 'وضعیت فعلی تعمیر'],
  ['nextAction', 'اقدام بعدی'],
  ['partsStatus', 'وضعیت قطعات'],
  ['blockingPart', 'قطعه معطل'],
  ['responsible', 'مسئول پیگیری'],
  ['unit', 'واحد درگیر'],
  ['deadlineDate', 'موعد تحویل'],
  ['blocker', 'مانع اصلی'],
  ['authStatus', 'وضعیت تأیید'],
  ['financeStatus', 'وضعیت مالی'],
  ['lastFollowUp', 'آخرین پیگیری'],
  ['extraNote', 'توضیح تکمیلی'],
  ['dataCheck', 'کنترل اطلاعات'],
  ['coverageType', 'نوع پوشش تأیید'],
  ['caseNumber', 'شماره پرونده Manage'],
  ['vin', 'VIN کامل'],
  ['dupCheck', 'کنترل تکرار'],
  ['admittedTime', 'ساعت پذیرش'],
  ['deadlineTime', 'ساعت موعد'],
];

/** Columns that must exist for the sheet to be recognised as the vehicle list. */
const CORE: ColumnKey[] = ['admissionNo', 'admittedDate', 'chassis', 'model', 'owner'];
/** A row describes a vehicle when one of these has a value. */
const CONTENT: ColumnKey[] = ['admissionNo', 'admittedDate', 'chassis', 'model', 'owner', 'plate', 'caseNumber', 'vin'];

const headerKey = (s: string) => searchKey(s).replace(/[()]/g, '');

export interface ParsedRow {
  rowNo: number;
  /** Original text by the file's own column header, for provenance. */
  source: Record<string, string>;
  get(key: ColumnKey): string;
}

export interface ParsedSheet {
  sheetName: string;
  /** 1-based row number of the header row. */
  headerRow: number;
  columns: Partial<Record<ColumnKey, number>>;
  unmappedColumns: string[];
  rows: ParsedRow[];
  blankRows: number[];
}

export class SheetError extends Error {}

/** Finds the vehicle list in an .xlsx export and returns its data rows. */
export function parseVehicleWorkbook(data: Uint8Array): ParsedSheet {
  let sheets: Worksheet[];
  try {
    sheets = readWorkbook(data);
  } catch (e) {
    throw new SheetError(e instanceof XlsxError ? e.message : 'فایل اکسل خوانده نشد');
  }
  const preferred = sheets.filter((s) => headerKey(s.name) === headerKey(VEHICLE_SHEET_NAME));
  for (const sheet of [...preferred, ...sheets.filter((s) => !preferred.includes(s))]) {
    const parsed = parseVehicleSheet(sheet);
    if (parsed) return parsed;
  }
  throw new SheetError(
    `برگه «${VEHICLE_SHEET_NAME}» با ستون‌های شماره کارت پذیرش، تاریخ پذیرش، شماره شاسی، خودرو و نام مالک پیدا نشد`,
  );
}

/** Null when the sheet has no recognisable header row in its first 15 rows. */
export function parseVehicleSheet(sheet: Worksheet): ParsedSheet | null {
  for (let h = 0; h < Math.min(sheet.rows.length, 15); h++) {
    const header = sheet.rows[h] ?? [];
    const columns: Partial<Record<ColumnKey, number>> = {};
    const unmapped: string[] = [];
    header.forEach((text, i) => {
      if (!text) return;
      const k = headerKey(text);
      const match = COLUMN_HEADERS.find(([key, prefix]) => columns[key] === undefined && k.startsWith(headerKey(prefix)));
      if (match) columns[match[0]] = i;
      else unmapped.push(text);
    });
    if (!CORE.every((k) => columns[k] !== undefined)) continue;

    const rows: ParsedRow[] = [];
    const blankRows: number[] = [];
    for (let r = h + 1; r < sheet.rows.length; r++) {
      const cells = sheet.rows[r] ?? [];
      const get = (key: ColumnKey) => {
        const i = columns[key];
        return i === undefined ? '' : (cells[i] ?? '').trim();
      };
      if (!CONTENT.some((k) => get(k))) {
        // Template rows with only a row number (or nothing) are reported, not imported.
        if (cells.some((c) => c)) blankRows.push(r + 1);
        continue;
      }
      const source: Record<string, string> = {};
      header.forEach((text, i) => {
        if (text && cells[i]) source[text] = cells[i]!;
      });
      rows.push({ rowNo: r + 1, source, get });
    }
    return { sheetName: sheet.name, headerRow: h + 1, columns, unmappedColumns: unmapped, rows, blankRows };
  }
  return null;
}

// ------------------------------------------------------------ normalizers

/** Matching key of an identifier: ASCII digits, no spaces or dashes, upper case. Leading zeros are kept. */
export function idKey(value: string): string {
  return toLatinDigits(value)
    .replace(/[\s‌\-_/.]+/g, '')
    .toUpperCase();
}

/** Admission numbers that do not identify a vehicle. */
export function isNonUniqueAdmission(value: string): boolean {
  const v = normalizePersian(value);
  return v === 'بدون پذیرش' || v.startsWith('برگشتی');
}

// Real VINs exclude I, O and Q (catches O/0 typos). Synthetic test VINs use the
// TESTVIN prefix (AGENTS.md), which is accepted explicitly.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export const isFullVin = (key: string) => VIN_RE.test(key) || /^TESTVIN[A-Z0-9]{10}$/.test(key);

export interface SheetDate {
  jy: number;
  jm: number;
  jd: number;
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * A date cell: Jalali text (۱۴۰۵/۰۸/۰۵, 1405-8-5) or an Excel date serial
 * (Gregorian, from a date-formatted cell). Null when empty; 'invalid' otherwise.
 */
export function parseSheetDate(raw: string): SheetDate | null | 'invalid' {
  const text = toLatinDigits(raw).trim();
  if (!text) return null;
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial < 20000 || serial > 80000) return 'invalid';
    // UTC midnight of that Gregorian day is 03:30 the same day in Tehran.
    const { jy, jm, jd } = toJalaliParts(new Date(EXCEL_EPOCH_UTC + serial * 86_400_000));
    return { jy, jm, jd };
  }
  const m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(text);
  if (!m) return 'invalid';
  const date = { jy: Number(m[1]), jm: Number(m[2]), jd: Number(m[3]) };
  return parseJalali(`${date.jy}/${date.jm}/${date.jd}`) ? date : 'invalid';
}

/** A time cell: "08:30", "۸:۳۰", "08:30:00" or an Excel day fraction. */
export function parseSheetTime(raw: string): string | null | 'invalid' {
  const text = toLatinDigits(raw).trim();
  if (!text) return null;
  if (/^0?\.\d+$/.test(text) || text === '0') {
    const minutes = Math.round(Number(text) * 24 * 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return 'invalid';
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

/** Tehran wall-clock date + time to an instant (fixed +03:30, see jalali.ts). */
export function toInstant(date: SheetDate, time: string): Date {
  return parseJalali(`${date.jy}/${date.jm}/${date.jd}`, time)!;
}

export const formatSheetDate = (d: SheetDate) =>
  `${d.jy}/${String(d.jm).padStart(2, '0')}/${String(d.jd).padStart(2, '0')}`;

// Stage and coverage wording of the sheet (and the app's own labels).
const STAGE_WORDS: [string, CaseStage][] = [
  ['پذیرش', 'reception'],
  ['کارشناسی', 'assessment'],
  ['انتظار مجوز', 'awaiting_approval'],
  ['در انتظار مجوز / تأیید', 'awaiting_approval'],
  ['انتظار قطعه', 'awaiting_parts'],
  ['در انتظار قطعه', 'awaiting_parts'],
  ['در حال تعمیر', 'in_repair'],
  ['کنترل کیفیت', 'quality_control'],
  ['آماده تحویل', 'ready_for_delivery'],
  ['تحویل‌شده', 'delivered'],
  ['تحویل شده', 'delivered'],
];

export function parseStage(raw: string): CaseStage | null | 'invalid' {
  if (!raw.trim()) return null;
  const k = searchKey(raw);
  return STAGE_WORDS.find(([w]) => searchKey(w) === k)?.[1] ?? 'invalid';
}

const COVERAGE_WORDS: [string, CoverageType][] = [
  ['کارت طلایی', 'golden_card'],
  ['امداد خودرو', 'golden_card'],
  ['کارت طلایی / امداد خودرو', 'golden_card'],
  ['بیمه بدنه', 'insurance'],
  ['بیمه', 'insurance'],
  ['شخصی', 'personal'],
  ['شخصی (مشتری)', 'personal'],
  ['ترکیبی', 'mixed'],
];

export function parseCoverage(raw: string): CoverageType | null | 'invalid' {
  if (!raw.trim()) return null;
  const k = searchKey(raw).replace(/[()]/g, '');
  return COVERAGE_WORDS.find(([w]) => searchKey(w).replace(/[()]/g, '') === k)?.[1] ?? 'invalid';
}

/** Manage case number as typed (Persian digits, spaces) to the stored form AC-1405-0001. */
export function normalizeCaseNumber(raw: string): string {
  return toLatinDigits(raw).replace(/\s+/g, '').toUpperCase();
}
