import { toLatinDigits } from './text';

// Supply codes of the dealership's stock and Emdad reports. For the standard
// 10-digit format the first 8 digits are the base part number and the last 2
// the supply option. The full code is the SKU for stock, price, reservation
// and handover; grouping by base is for display only (not a technical
// equivalence). Other shapes (letters, other lengths) stay standalone and
// "need mapping". A full code is never invented (no "00" or other suffix).

export type StockCodeKind = 'standard' | 'needs_mapping';

export interface StockCode {
  /** Value as it appeared in the file. */
  raw: string;
  /** Normalized identifier used for matching (digits ASCII, upper case, no spaces). */
  fullStockCode: string;
  basePartNumber: string | null;
  supplySuffix: string | null;
  kind: StockCodeKind;
  /** An Excel control prefix or control characters were removed. */
  cleaned: boolean;
}

// Excel writes U+001F as the literal text "_x001F_" when exporting it.
const CONTROL_TEXT = /_x00[01][0-9A-F]_/gi;
const CONTROL_CHARS = /[\u0000-\u001f‌‏‎]/g;

export function parseStockCode(raw: string | null | undefined): StockCode | null {
  if (raw == null) return null;
  const text = String(raw);
  const stripped = text.replace(CONTROL_TEXT, '').replace(CONTROL_CHARS, '');
  const full = toLatinDigits(stripped).replace(/\s+/g, '').toUpperCase();
  if (!full) return null;
  const standard = /^\d{10}$/.test(full);
  return {
    raw: text,
    fullStockCode: full,
    basePartNumber: standard ? full.slice(0, 8) : null,
    supplySuffix: standard ? full.slice(8) : null,
    kind: standard ? 'standard' : 'needs_mapping',
    cleaned: stripped !== text,
  };
}

/** 8-digit base part number (e.g. Emdad "کد قطعه"); null when not exactly 8 digits. */
export function parseBasePartNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = toLatinDigits(String(raw).replace(CONTROL_TEXT, '').replace(CONTROL_CHARS, '')).replace(/\s+/g, '');
  return /^\d{8}$/.test(v) ? v : null;
}

/**
 * Exact decimal as a canonical string ("12.5", "0.888", "3"), or null when not a
 * plain non-negative number. No float conversion, no rounding, no truncation.
 */
export function parseDecimal(raw: string | number | null | undefined, opts: { allowNegative?: boolean } = {}): string | null {
  if (raw == null) return null;
  let v = toLatinDigits(String(raw)).trim().replace(/٫/g, '.').replace(/[٬]/g, ',');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) v = v.replace(/,/g, '');
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v);
  if (!m) return null;
  if (m[1] && !opts.allowNegative) return null;
  const int = m[2]!.replace(/^0+(?=\d)/, '');
  const frac = (m[3] ?? '').replace(/0+$/, '');
  const out = frac ? `${int}.${frac}` : int;
  return m[1] && out !== '0' ? `-${out}` : out;
}

/** Compare two canonical decimal strings (non-negative). */
export function compareDecimal(a: string, b: string): number {
  const [ai, af = ''] = a.split('.');
  const [bi, bf = ''] = b.split('.');
  if (ai!.length !== bi!.length) return ai!.length < bi!.length ? -1 : 1;
  if (ai !== bi) return ai! < bi! ? -1 : 1;
  const len = Math.max(af.length, bf.length);
  const fa = af.padEnd(len, '0');
  const fb = bf.padEnd(len, '0');
  return fa === fb ? 0 : fa < fb ? -1 : 1;
}
