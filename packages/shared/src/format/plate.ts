import { normalizePersian, toPersianDigits } from '../text';

export interface Plate {
  two: string;
  letter: string;
  three: string;
  region: string | null;
}

export interface OtherPlate {
  type: 'other';
  raw: string;
}

export interface InvalidPlate {
  plate: null;
  reason: 'not_text' | 'empty' | 'invalid_format' | 'unsupported_letter';
}

const LETTER_ALIASES: Readonly<Record<string, string>> = {
  'ا': 'الف', 'آ': 'الف', 'الف': 'الف', '♿': 'ژ',
  b: 'ب', d: 'D', s: 'S',
};
const PERSIAN_LETTER = /^[بپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]$/u;
const FORMAT_CONTROLS = /[\p{Bidi_Control}\u200B\u200D\u2060\uFE0F\uFEFF]/gu;
const NON_NATIONAL_LABEL = /موتور\s*سیکلت|\b(?:motorcycle|free[\s-]*zone)\b|منطقه\s*آزاد/u;
const FREE_ZONE_NAME = /^(?:کیش|قشم|اروند|انزلی|ارس|چابهار|ماکو)[\s:–-]*\d+$|^\d+[\s:–-]*(?:کیش|قشم|اروند|انزلی|ارس|چابهار|ماکو)$/u;

/** Returns a national plate, untouched text for recognizable other plates, or null with a reason. */
export function parsePlate(input: unknown): Plate | OtherPlate | InvalidPlate {
  if (typeof input !== 'string') return { plate: null, reason: 'not_text' };
  const text = normalizePersian(input.replace(FORMAT_CONTROLS, '')).toLowerCase();
  if (!text) return { plate: null, reason: 'empty' };
  const compact = text.replace(/[\s\p{Dash_Punctuation}−|/:]+/gu, '');
  if (NON_NATIONAL_LABEL.test(text) || FREE_ZONE_NAME.test(text) || /^\d{8}$/.test(compact)) {
    return { type: 'other', raw: input };
  }

  // Exports can place the explicit region block before or after the main number.
  const regionFirst = /^(?:ایران|iran)(\d{2})(\d{2})([^\d]+)(\d{3})$/u.exec(compact);
  const mainFirst = /^(\d{2})([^\d]+)(\d{3})(?:(?:ایران|iran)?(\d{2}))?$/u.exec(compact);
  const fields = regionFirst
    ? { two: regionFirst[2]!, letter: regionFirst[3]!, three: regionFirst[4]!, region: regionFirst[1]! }
    : mainFirst && { two: mainFirst[1]!, letter: mainFirst[2]!, three: mainFirst[3]!, region: mainFirst[4] ?? null };
  if (!fields) return { plate: null, reason: 'invalid_format' };

  const letter = Object.hasOwn(LETTER_ALIASES, fields.letter)
    ? LETTER_ALIASES[fields.letter]!
    : fields.letter;
  if (letter !== 'الف' && letter !== 'D' && letter !== 'S' && !PERSIAN_LETTER.test(letter)) {
    return { plate: null, reason: 'unsupported_letter' };
  }
  return { ...fields, letter };
}

export type PlateStyle = 'display' | 'compact' | 'search';

/** Search keys omit the region to match partial queries and cannot serve as unique IDs. */
export function formatPlate(plate: Plate | OtherPlate, style: PlateStyle = 'display'): string {
  if ('raw' in plate) return plate.raw;
  if (style === 'search') {
    const letter = plate.letter === 'ب' ? 'b' : plate.letter.toLowerCase();
    return `${plate.two}${letter}${plate.three}`;
  }
  const region = plate.region === null ? '' : style === 'display' ? ` – ایران ${plate.region}` : `–${plate.region}`;
  return toPersianDigits(`${plate.two} ${plate.letter} ${plate.three}${region}`);
}

/** Normalizes a full or partial national plate query; null for other or invalid inputs. */
export function plateSearchKey(input: unknown): string | null {
  const plate = parsePlate(input);
  return 'two' in plate ? formatPlate(plate, 'search') : null;
}
