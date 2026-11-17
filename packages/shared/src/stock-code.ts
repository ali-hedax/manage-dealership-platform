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

// ------------------------------------------------ part identifiers (owner, 2026-11-17)
// «کد اختصاصی» = the 8-digit assessment identifier of the part used in the
// assessment. «کد تدارکاتی» = the 10-digit procurement identifier: its first 8
// digits are the assessment identifier and its last 2 the manufacturer, so
// several manufacturers share one 8-digit base. Both are text: leading zeros are
// kept. A market-purchase technical code is kept complete (any length, letters).

const cleanCode = (raw: string | null | undefined) =>
  raw == null ? '' : toLatinDigits(String(raw).replace(CONTROL_TEXT, '').replace(CONTROL_CHARS, '')).replace(/[\s‌\-_./]/g, '').toUpperCase();

/** 10-digit procurement code («کد تدارکاتی»), or null. */
export function parseProcurementCode(raw: string | null | undefined): string | null {
  const v = cleanCode(raw);
  return /^\d{10}$/.test(v) ? v : null;
}

/** 8-digit assessment code («کد اختصاصی») of a code that is either 8 or 10 digits, or null. */
export function assessmentCodeOf(raw: string | null | undefined): string | null {
  const v = cleanCode(raw);
  return /^\d{8}$/.test(v) ? v : /^\d{10}$/.test(v) ? v.slice(0, 8) : null;
}

/** A complete technical code of a market purchase: Latin digits, upper case, no spaces; letters and any length kept. */
export function normalizeTechnicalCode(raw: string | null | undefined): string | null {
  const v = cleanCode(raw);
  return v || null;
}

export interface PartIdentifiers {
  /** 8-digit assessment identifier, when the line has one. */
  assessmentCode: string | null;
  /** 10-digit procurement identifier, when known (recorded, chosen or read from the special-aid report). */
  procurementCode: string | null;
  /** What the parts list shows: the full procurement code of a special-aid line when known, else the stored code. */
  displayCode: string | null;
}

export function partIdentifiers(p: { partNumber: string | null; procurementCode?: string | null; source?: string | null }): PartIdentifiers {
  const procurementCode = parseProcurementCode(p.procurementCode) ?? parseProcurementCode(p.partNumber);
  const assessmentCode = assessmentCodeOf(p.partNumber) ?? (procurementCode ? procurementCode.slice(0, 8) : null);
  const displayCode = p.source === 'company' && procurementCode ? procurementCode : p.partNumber;
  return { assessmentCode, procurementCode, displayCode };
}

/**
 * Field-level check of a special-aid registration; null when valid, else the Persian reason.
 * The stored technical code of the line is kept as it is (older lines may carry other
 * shapes); the procurement code typed here must be exactly 10 digits with the line's base.
 */
export function specialAidCodeProblem(partNumber: string | null, requestedCode: string | null | undefined): string | null {
  const assessment = assessmentCodeOf(partNumber);
  if (requestedCode == null || requestedCode === '') return null;
  const procurement = parseProcurementCode(requestedCode);
  if (!procurement) return 'کد تدارکاتی باید دقیقاً ۱۰ رقم باشد';
  if (assessment && procurement.slice(0, 8) !== assessment) return '۸ رقم اول کد تدارکاتی با کد اختصاصی قطعه یکی نیست';
  return null;
}

/** Comparison key of a special-aid number («شمارهٔ امداد ویژه»): Latin digits, no spaces; the stored text is never rewritten. */
export function emdadNoKey(raw: string | null | undefined): string | null {
  const v = cleanCode(raw);
  return v || null;
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
