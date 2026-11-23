import { createHash } from 'node:crypto';
import { parseJalali, TEHRAN_OFFSET_MINUTES, toLatinDigits } from '@manage/shared';
import { KasbError } from './kasb-errors';

// Lists of کسب‌وکار are columnar: { Structure: [column names], Rows: [[values]] }. They are
// always mapped by column name, never by position; unknown columns are kept (row.official) so
// nothing is lost when the site adds a column. Pure module.

export type KasbRow = Record<string, unknown>;
export interface KasbTable {
  columns: string[];
  rows: KasbRow[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function columnName(c: unknown): string {
  if (typeof c === 'string') return c;
  if (isObject(c)) for (const k of ['Name', 'name', 'ColumnName', 'Column', 'Field']) if (typeof c[k] === 'string') return c[k] as string;
  throw new KasbError('KASB_PROTOCOL');
}

/** Structure/Rows (or an array of objects) as rows keyed by column name. An empty Structure is an empty list. */
export function parseTable(data: unknown): KasbTable {
  if (data == null || data === '') return { columns: [], rows: [] };
  if (Array.isArray(data)) {
    const rows = data.filter(isObject);
    return { columns: [...new Set(rows.flatMap((r) => Object.keys(r)))], rows };
  }
  if (!isObject(data) || !Array.isArray(data.Structure) || (data.Rows != null && !Array.isArray(data.Rows))) throw new KasbError('KASB_PROTOCOL');
  const columns = data.Structure.map(columnName);
  const rows = ((data.Rows as unknown[] | null) ?? []).map((raw) => {
    if (isObject(raw)) return { ...raw };
    if (!Array.isArray(raw)) throw new KasbError('KASB_PROTOCOL');
    const row: KasbRow = {};
    columns.forEach((c, i) => { row[c] = raw[i] ?? null; });
    return row;
  });
  return { columns, rows };
}

/** Display text: trimmed, Arabic yeh/kaf as Persian, whitespace collapsed; empty is null. */
export function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
  return s === '' || s === 'null' ? null : s;
}

/** Identifier text (admission, card, chassis, codes): ASCII digits, trimmed; leading zeros kept. */
export function idText(value: unknown): string | null {
  const s = cleanText(value);
  return s == null ? null : toLatinDigits(s);
}

/** The first non-empty text among candidate columns. */
export function pickText(row: KasbRow, columns: readonly string[]): string | null {
  for (const c of columns) {
    const v = cleanText(row[c]);
    if (v != null) return v;
  }
  return null;
}

/** A number from a numeric cell or text («۱٬۲۵۰٬۰۰۰», "1,250,000.00"); null when absent or not a number. */
export function numberOf(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = toLatinDigits(String(value)).replace(/[٬,\s]/g, '').replace(/٫/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
export const intOf = (value: unknown): number | null => {
  const n = numberOf(value);
  return n == null ? null : Math.round(n);
};
/** Quantity as exact text ("1", "2.5"), as numeric columns store it. */
export const quantityText = (value: unknown): string | null => {
  const n = numberOf(value);
  return n == null ? null : String(n);
};

/** Flags arrive as 1/0, "1"/"0", true/false, "Y"/"N" or Persian yes/no. */
export function flagOf(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const s = cleanText(value);
  return s != null && /^(1|true|y|yes|بله|دارد)$/i.test(toLatinDigits(s));
}

const OFFSET = TEHRAN_OFFSET_MINUTES * 60_000;

/** "2026/11/23 08:57:27" (Gregorian, Tehran wall clock) as a UTC instant. */
export function tehranGregorian(text: string): Date | null {
  const m = toLatinDigits(text).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number) as number[];
  const date = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!) - OFFSET);
  return Number.isNaN(date.getTime()) || mo! > 12 || d! > 31 ? null : date;
}

/**
 * A date of کسب‌وکار with an optional separate time: Jalali (1405/09/02 + 08:56) or Gregorian
 * Tehran time (2026/11/23 08:57:27). The year tells them apart. Null when absent or invalid.
 */
export function kasbInstant(dateValue: unknown, timeValue?: unknown): Date | null {
  const date = idText(dateValue);
  if (!date) return null;
  const year = Number(/^(\d{4})/.exec(date)?.[1] ?? NaN);
  if (!Number.isFinite(year)) return null;
  const time = idText(timeValue);
  if (year >= 1700) return tehranGregorian(time && !/\d:\d/.test(date) ? `${date} ${time}` : date);
  const dayPart = date.split(/[ T]/)[0]!;
  const clock = time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5).padStart(5, '0') : (/[ T](\d{1,2}:\d{2})/.exec(date)?.[1] ?? '00:00');
  return parseJalali(dayPart, clock);
}

/** JSON with sorted keys, so a column moving in Structure never changes the hash. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
export const rowHash = (row: KasbRow) => createHash('sha256').update(stableJson(row)).digest('hex');
