import { normalizeRoles } from './enums';
import { maskPhone } from './text';

/**
 * Server-side masking for guests (spec section 29.7): a guest reads with the customer's full
 * name, full chassis/VIN, phone and amounts hidden. The API applies this to every JSON response
 * of a masked viewer; files and exports cannot be masked and are refused to a guest.
 */
export function isMaskedViewer(roles: readonly string[], isOwner = false): boolean {
  return !isOwner && normalizeRoles(roles).includes('guest');
}

const MASK = '*';

/** Keeps only the last four characters: `TESTVIN0000000001` → `*************0001`, `TST12345` → `****2345`. */
export function maskVin(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const v = value.trim();
  if (v.length <= 4) return MASK.repeat(4);
  return MASK.repeat(v.length - 4) + v.slice(-4);
}

/** First word stays, every other word keeps its initial: «مشتری نمونه یک» → «مشتری ن. ی.». */
export function maskPersonName(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  if (words.length === 1) return `${[...words[0]!][0]}.`;
  return [words[0], ...words.slice(1).map((w) => `${[...w][0]}.`)].join(' ');
}

// 17-character VIN or ISACO 8-character chassis (letters and digits, upper case). Upper case only
// keeps lower-case UUIDs untouched; digit-only part and request codes never match.
const VIN_TOKEN = /\b(?=[A-Z0-9]{17}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{17}\b|\b(?=[A-Z0-9]{8}\b)(?=[A-Z0-9]*[A-Z])(?=(?:[A-Z]*\d){4})[A-Z0-9]{8}\b/g;
// Iranian mobile numbers in Latin or Persian digits, with or without +98.
const MOBILE_TOKEN = /(?<![0-9۰-۹])(?:\+98|0098|[0۰])[9۹][0-9۰-۹]{9}(?![0-9۰-۹])/g;

/** Masks chassis/VIN and mobile numbers written inside free text (notes, titles, file names). */
export function redactText(value: string): string {
  return value.replace(VIN_TOKEN, (m) => maskVin(m)!).replace(MOBILE_TOKEN, (m) => maskPhone(m)!);
}

const NAME_KEYS = new Set(['customerName', 'fullName', 'ownerName', 'recipientName', 'familyName', 'delivererName']);
const PHONE_KEYS = new Set(['phone', 'mobile', 'delivererMobile', 'ownerPhone', 'customerPhone']);
const VIN_KEYS = new Set(['vin', 'chassis', 'chassisRef', 'vinText', 'vinTexts', 'vehicleVin']);
const isMoneyKey = (k: string) => /Rial$/.test(k) || /(?:^|[a-z])(?:[pP]rice|[cC]ost)$/.test(k) || k === 'prices' || k === 'wage' || k === 'amount';

function maskValue(key: string | null, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (key && isMoneyKey(key) && (typeof value === 'number' || typeof value === 'string' || typeof value === 'object')) return null;
  if (typeof value === 'string') {
    if (key && NAME_KEYS.has(key)) return maskPersonName(value);
    if (key && PHONE_KEYS.has(key)) return maskPhone(value);
    if (key && VIN_KEYS.has(key)) return maskVin(value);
    return redactText(value);
  }
  if (Array.isArray(value)) return value.map((v) => maskValue(key && VIN_KEYS.has(key) ? key : null, v));
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskValue(k, v);
    return out;
  }
  return value;
}

/** Deep copy of a JSON-like response with every customer-identifying value masked for a guest. */
export function maskForGuest<T>(value: T): T {
  return maskValue(null, value) as T;
}
