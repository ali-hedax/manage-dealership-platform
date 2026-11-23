import { normalizeVin, toLatinDigits } from '@manage/shared';

/**
 * Text extraction for admission-card images (owner decision E, 2026-11-22). No provider is
 * configured by default: the server has no reliable offline OCR and no paid external service
 * is mandatory. A future provider implements this interface; its numbers are only candidates
 * and a card is linked only when they match an existing admission or VIN exactly.
 */
export interface CardTextExtractor {
  readonly provider: string;
  extract(bytes: Buffer, mime: string): Promise<{ admissionNo: string | null; vin: string | null } | null>;
}
export const CARD_EXTRACTOR = Symbol('CARD_EXTRACTOR');

/** Default: nothing is extracted; an administrator types the admission number or VIN. */
export class NoCardExtractor implements CardTextExtractor {
  readonly provider = 'none';
  async extract(): Promise<null> { return null; }
}

/** Candidate numbers in OCR text, for providers that return plain text. */
export function cardNumbersFromText(text: string): { admissionNo: string | null; vin: string | null } {
  const latin = toLatinDigits(text).toUpperCase();
  const vin = /\b[A-HJ-NPR-Z0-9]{17}\b/.exec(latin)?.[0] ?? null;
  const admission = /(?:پذیرش|ADMISSION)[^0-9]{0,20}([0-9][0-9/-]{3,20})/.exec(toLatinDigits(text))?.[1] ?? null;
  return { admissionNo: admission, vin: vin ? normalizeVin(vin) : null };
}

/** The file really is the declared image or PDF (magic bytes), whatever its name says. */
export function sniffCardMime(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}
