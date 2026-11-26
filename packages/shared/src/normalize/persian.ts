export type DigitStyle = "persian" | "latin";

export interface NormalizePersianOptions {
  digits?: DigitStyle;
}

const ARABIC_AND_PERSIAN_DIGITS = /[٠-٩۰-۹]/g;
const INVISIBLE_AND_BIDI_CONTROLS = /[\u200B\u200D-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

const toLatinDigit = (digit: string): string => {
  const codePoint = digit.charCodeAt(0);
  const value = codePoint >= 0x06f0 ? codePoint - 0x06f0 : codePoint - 0x0660;
  return String(value);
};

export function normalizePersian(
  text: string,
  options: NormalizePersianOptions = {},
): string {
  const digitStyle = options.digits ?? "persian";

  return text
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک")
    .replace(INVISIBLE_AND_BIDI_CONTROLS, "")
    .replace(ARABIC_AND_PERSIAN_DIGITS, (digit) => {
      const latinDigit = toLatinDigit(digit);
      return digitStyle === "latin"
        ? latinDigit
        : String.fromCharCode(0x06f0 + Number(latinDigit));
    })
    .replace(/[\t\n\r ]+/g, " ")
    .trim();
}

export function normalizeKey(value: unknown): string {
  return String(value);
}
