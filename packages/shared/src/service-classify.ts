import { JOB_CLASSIFICATION_CONFIG } from './service-classify.config';

export interface JobClassification {
  oilChange: boolean;
  repair: boolean;
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
    .replace(ARABIC_AND_PERSIAN_DIGITS, (digit) => {
      const code = digit.charCodeAt(0);
      const offset = code >= DIGIT_OFFSETS.persian ? DIGIT_OFFSETS.persian : DIGIT_OFFSETS.arabic;
      return String(code - offset);
    })
    .replace(/[\u200c\u200d\u2060\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizedConfig = {
  periodicServiceNames: JOB_CLASSIFICATION_CONFIG.periodicServiceNames.map(normalizePersianJobText),
  oilChangePartNames: JOB_CLASSIFICATION_CONFIG.oilChangePartNames.map(normalizePersianJobText),
  excludedOilNames: JOB_CLASSIFICATION_CONFIG.excludedOilNames.map(normalizePersianJobText),
};

function includesAny(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

function withoutExcludedOils(value: string): string {
  return normalizedConfig.excludedOilNames
    .reduce((remaining, excluded) => remaining.replaceAll(excluded, ' '), value)
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyJob(labourNames: string[], consumedParts: string[]): JobClassification {
  const reasons: string[] = [];
  let oilChange = false;
  let repair = false;

  for (const originalName of labourNames) {
    const name = normalizePersianJobText(originalName);
    if (!name) continue;

    const periodicService = includesAny(withoutExcludedOils(name), normalizedConfig.periodicServiceNames);

    if (periodicService) {
      oilChange = true;
      reasons.push(`اجرت سرویس دوره‌ای: ${originalName}`);
    } else {
      repair = true;
      reasons.push(`اجرت تعمیراتی: ${originalName}`);
    }
  }

  for (const originalName of consumedParts) {
    const name = normalizePersianJobText(originalName);
    if (!name) continue;
    if (includesAny(withoutExcludedOils(name), normalizedConfig.oilChangePartNames)) {
      oilChange = true;
      reasons.push(`قطعه سرویس روغن: ${originalName}`);
    }
  }

  return { oilChange, repair, reasons };
}
