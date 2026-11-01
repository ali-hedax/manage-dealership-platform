// Persian text normalization used for storage, search and display.

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Converts Persian and Arabic-Indic digits to ASCII digits. */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const p = PERSIAN_DIGITS.indexOf(ch);
    return String(p >= 0 ? p : ARABIC_DIGITS.indexOf(ch));
  });
}

/** Converts ASCII digits to Persian digits for display. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]!);
}

/**
 * Canonical form for Persian text: Arabic yeh/kaf to Persian, digits to
 * ASCII, tatweel and diacritics removed, whitespace collapsed.
 */
export function normalizePersian(input: string): string {
  return toLatinDigits(input)
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Search key: normalized, lower-case, no spaces, dashes or separators. */
export function searchKey(input: string): string {
  return normalizePersian(input)
    .toLowerCase()
    .replace(/[\s\-_/|.,]+/g, '');
}

/** VINs are stored upper-case without spaces. */
export function normalizeVin(input: string): string {
  return toLatinDigits(input).replace(/\s+/g, '').toUpperCase();
}

/** Iranian mobile numbers stored as 09xxxxxxxxx when recognisable. */
export function normalizePhone(input: string): string {
  const digits = toLatinDigits(input).replace(/[^0-9+]/g, '');
  if (digits.startsWith('+98')) return '0' + digits.slice(3);
  if (digits.startsWith('0098')) return '0' + digits.slice(4);
  if (/^9\d{9}$/.test(digits)) return '0' + digits;
  return digits;
}

/** Masks a phone number for roles without customer.pii.read, e.g. 0912***4567. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.length < 7) return '***';
  return phone.slice(0, 4) + '***' + phone.slice(-4);
}
