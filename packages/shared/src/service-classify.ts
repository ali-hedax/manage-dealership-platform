import { JOB_CLASSIFICATION_CONFIG } from './service-classify.config';

export interface JobClassification {
  /** Any service (5000/10000/20000, oil and filter, quick service) or engine oil / oil filter used. */
  oilChange: boolean;
  /** Any labour line that is not a periodic service. */
  repair: boolean;
  /** «سرویس سریع»: a quick-service labour line, or the card's «سالن تعمیرات» is the quick-service hall. */
  quickService: boolean;
  reasons: string[];
}

const ARABIC_AND_PERSIAN_DIGITS = /[٠-٩۰-۹]/g;
const DIGIT_OFFSETS = {
  arabic: '٠'.charCodeAt(0),
  persian: '۰'.charCodeAt(0),
} as const;

export function normalizePersianJobText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[يك]/g, (letter) => (letter === 'ي' ? 'ی' : 'ک'))
    // «کوئیک» and «کوییک» are the same word as typed in کسب‌وکار.
    .replace(/ئ/g, 'ی')
    .replace(ARABIC_AND_PERSIAN_DIGITS, (digit) => {
      const code = digit.charCodeAt(0);
      const offset = code >= DIGIT_OFFSETS.persian ? DIGIT_OFFSETS.persian : DIGIT_OFFSETS.arabic;
      return String(code - offset);
    })
    // Thousands separators inside a number: «۱۰٬۰۰۰», «10,000», «۱۰،۰۰۰» → 10000.
    .replace(/(\d)[,٬،](?=\d{3}(?!\d))/g, '$1')
    .replace(/[‌‍⁠﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizedConfig = {
  periodicServiceNames: JOB_CLASSIFICATION_CONFIG.periodicServiceNames.map(normalizePersianJobText),
  quickServiceNames: JOB_CLASSIFICATION_CONFIG.quickServiceNames.map(normalizePersianJobText),
  oilChangePartNames: JOB_CLASSIFICATION_CONFIG.oilChangePartNames.map(normalizePersianJobText),
  excludedOilNames: JOB_CLASSIFICATION_CONFIG.excludedOilNames.map(normalizePersianJobText),
};
/** «سرویس» then up to three words, then exactly one of the kilometre marks. */
const PERIODIC_KM = new RegExp(`سرویس(?:\\s*[^\\s\\d]+){0,3}\\s*(?<!\\d)(?:${JOB_CLASSIFICATION_CONFIG.periodicServiceKm.join('|')})(?!\\d)`);

function includesAny(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

function withoutExcludedOils(value: string): string {
  return normalizedConfig.excludedOilNames
    .reduce((remaining, excluded) => remaining.replaceAll(excluded, ' '), value)
    .replace(/\s+/g, ' ')
    .trim();
}

/** A labour name that is a periodic service (oil change) under the owner's rule. */
export function isPeriodicServiceName(originalName: string): boolean {
  const name = withoutExcludedOils(normalizePersianJobText(originalName));
  return !!name && (includesAny(name, normalizedConfig.periodicServiceNames) || PERIODIC_KM.test(name));
}

/** A labour name or a «سالن تعمیرات» value that means quick service. */
export function isQuickServiceName(original: string | null | undefined): boolean {
  const name = normalizePersianJobText(original ?? '');
  return !!name && includesAny(name, normalizedConfig.quickServiceNames);
}

/** A used part that makes the card an oil change (engine oil or oil filter, not gearbox/brake/hydraulic oil). */
export function isOilChangePartName(originalName: string): boolean {
  const name = withoutExcludedOils(normalizePersianJobText(originalName));
  return !!name && includesAny(name, normalizedConfig.oilChangePartNames);
}

/**
 * Oil change / repair / quick service of one car from its labour names, the names of the parts it
 * actually used, and (when its column is confirmed) the card's «سالن تعمیرات». Not exclusive.
 */
export function classifyJob(labourNames: string[], consumedParts: string[], hall?: string | null): JobClassification {
  const reasons: string[] = [];
  let oilChange = false;
  let repair = false;
  let quickService = false;

  for (const originalName of labourNames) {
    if (!normalizePersianJobText(originalName)) continue;
    if (isPeriodicServiceName(originalName)) {
      oilChange = true;
      reasons.push(`اجرت سرویس دوره‌ای: ${originalName}`);
      if (isQuickServiceName(originalName)) quickService = true;
    } else {
      repair = true;
      reasons.push(`اجرت تعمیراتی: ${originalName}`);
    }
  }

  for (const originalName of consumedParts) {
    if (isOilChangePartName(originalName)) {
      oilChange = true;
      reasons.push(`قطعه سرویس روغن: ${originalName}`);
    }
  }

  if (hall && isQuickServiceName(hall)) {
    quickService = true;
    reasons.push(`سالن تعمیرات: ${hall}`);
  }

  return { oilChange, repair, quickService, reasons };
}
