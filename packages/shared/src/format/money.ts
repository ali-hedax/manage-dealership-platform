import { normalizePersian, toPersianDigits } from '../text';

/** Pass bigint (or parse text) for amounts outside the safe JavaScript integer range. */
export type Rial = bigint | number;

function exactRial(amount: Rial): bigint {
  if (typeof amount === 'bigint') return amount;
  if (!Number.isSafeInteger(amount)) throw new RangeError('مبلغ ریالی باید عدد صحیح دقیق باشد.');
  return BigInt(amount);
}

const RIAL_PER_TOMAN = 10n;

function groupDigits(amount: bigint): string {
  return toPersianDigits(amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
}

export interface MoneyFormatOptions {
  /** Rounds abbreviated values to the nearest tenth, with ties away from zero. */
  short?: boolean;
}

const MAGNITUDES = [
  { scale: 1_000_000_000n, label: 'میلیارد' },
  { scale: 1_000_000n, label: 'میلیون' },
  { scale: 1_000n, label: 'هزار' },
] as const;

function decimalTenth(tenths: bigint): string {
  const fraction = tenths % 10n;
  return groupDigits(tenths / 10n) + (fraction ? '٫' + toPersianDigits(String(fraction)) : '');
}

function formatMoney(rial: Rial, unit: 'ریال' | 'تومان', options: MoneyFormatOptions): string {
  const amount = exactRial(rial);
  const absolute = amount < 0n ? -amount : amount;
  const sign = amount < 0n ? '−' : '';
  const unitScale = unit === 'تومان' ? RIAL_PER_TOMAN : 1n;
  if (options.short) {
    const magnitude = MAGNITUDES.find(({ scale }) => {
      const divisor = scale * unitScale;
      return (absolute * 10n + divisor / 2n) / divisor >= 10n;
    });
    if (magnitude) {
      const divisor = magnitude.scale * unitScale;
      const tenths = (absolute * 10n + divisor / 2n) / divisor;
      return `${sign}${decimalTenth(tenths)} ${magnitude.label} ${unit}`;
    }
  }
  // One Rial is a tenth of a Toman. Normal display preserves the exact value.
  const displayed = unit === 'تومان' ? decimalTenth(absolute) : groupDigits(absolute);
  return `${sign}${displayed} ${unit}`;
}

export function formatRial(amount: Rial, options: MoneyFormatOptions = {}): string {
  return formatMoney(amount, 'ریال', options);
}

/** Input is in Rial; output is in Toman. */
export function formatToman(amount: Rial, options: MoneyFormatOptions = {}): string {
  return formatMoney(amount, 'تومان', options);
}

/** Parses exact amounts into integer Rial. A missing suffix means Rial. */
export function parseMoney(input: string): bigint | null {
  const text = normalizePersian(input).replace('−', '-');
  const match = /^([+-]?)(\d+|\d{1,3}(?:[٬, ]\d{3})+)(?:[٫.](\d))?\s*(ریال|تومان)?$/u.exec(text);
  if (!match) return null;
  const [, sign, whole, fraction, unit] = match;
  // A single decimal Toman digit is exactly a whole Rial.
  if (fraction !== undefined && unit !== 'تومان') return null;
  const scale = unit === 'تومان' ? RIAL_PER_TOMAN : 1n;
  const amount = BigInt(whole!.replace(/[٬, ]/g, '')) * scale + BigInt(fraction ?? '0');
  return sign === '-' ? -amount : amount;
}

export function sumRial(list: readonly Rial[]): bigint {
  return list.reduce<bigint>((sum, amount) => sum + exactRial(amount), 0n);
}

export interface ReceptionBillInput {
  total: Rial;
  freeSale: Rial;
  outsideWork: Rial;
  /** If omitted, derive the customer share as the exact remainder. */
  customerShare?: Rial;
}

export function splitReceptionBill(input: ReceptionBillInput) {
  const total = exactRial(input.total);
  const freeSale = exactRial(input.freeSale);
  const outsideWork = exactRial(input.outsideWork);
  const customerShare = input.customerShare === undefined
    ? total - freeSale - outsideWork
    : exactRial(input.customerShare);
  if ([total, customerShare, freeSale, outsideWork].some((part) => part < 0n)) {
    throw new RangeError('مبلغ صورتحساب و سهم‌ها باید نامنفی باشد.');
  }
  if (sumRial([customerShare, freeSale, outsideWork]) !== total) {
    throw new RangeError('جمع سهم‌ها با مبلغ کل صورتحساب برابر نیست.');
  }
  return { total, customerShare, freeSale, outsideWork };
}
