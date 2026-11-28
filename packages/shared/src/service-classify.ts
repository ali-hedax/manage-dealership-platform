import { DECLINED_LABOUR_STATES, DEFAULT_JOB_CODES, JOB_CLASSIFICATION_CONFIG } from './service-classify.config';

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

/** One labour line of a card: code, name, defect group («910100 - سرویس سریع …» or the bare code) and state text. */
export interface JobLabourLine {
  code?: string | null;
  name?: string | null;
  group?: string | null;
  state?: string | null;
}
/** One part line the car actually used (see `isConsumedPart`). */
export interface JobPartLine {
  code?: string | null;
  name?: string | null;
}
export interface JobCodes {
  serviceLabourCodes: readonly string[];
  quickServiceGroups: readonly string[];
  oilPartCodes: readonly string[];
}
export interface CardClassification extends JobClassification {
  /** Labour lines the customer refused («عدم تمایل به انجام تعمیر»): shown apart, never counted as work. */
  declined: number;
}

const codeKey = (code: string | null | undefined) => normalizePersianJobText(code ?? '').replace(/\s+/g, '').toUpperCase();
/** «910100 - سرویس سریع (کوئیک سرویس)» → 910100. */
export const defectGroupCode = (group: string | null | undefined) => /^\s*(\d{6})(?!\d)/.exec(normalizePersianJobText(group ?? ''))?.[1] ?? null;
/** ISACO base part number: the first eight characters (stock codes may carry a supply suffix). */
const partKey = (code: string | null | undefined) => codeKey(code).slice(0, 8);
const declinedStates = DECLINED_LABOUR_STATES.map(normalizePersianJobText);
export const isDeclinedLabour = (state: string | null | undefined) => {
  const s = normalizePersianJobText(state ?? '');
  return !!s && declinedStates.some((d) => s.includes(d));
};

/**
 * Oil change / repair / quick service of one car (owner, H4 part 1, 2026-11-28). Codes first:
 * - a labour line with a service code, or under the quick-service defect group, is an oil change;
 * - any other labour line with a code or a name is a technical repair — a line without a name is
 *   never «no work»;
 * - a used part with an oil code (base part number) is an oil change.
 * The names only add to the codes (a periodic service or oil named in the line). A line the customer
 * refused is left out and counted in `declined`. Not exclusive: a car can be both.
 */
export function classifyCard(labour: readonly JobLabourLine[], parts: readonly JobPartLine[], hall: string | null | undefined, codes: JobCodes = DEFAULT_JOB_CODES): CardClassification {
  const service = new Set(codes.serviceLabourCodes.map(codeKey));
  const quickGroups = new Set(codes.quickServiceGroups.map(codeKey));
  const oilParts = new Set(codes.oilPartCodes.map(partKey));
  const reasons: string[] = [];
  let oilChange = false, repair = false, quickService = false, declined = 0;
  for (const line of labour) {
    const code = codeKey(line.code), name = line.name?.trim() ? line.name : null;
    if (!code && !name) continue;
    const label = name ?? code;
    if (isDeclinedLabour(line.state)) {
      declined += 1;
      reasons.push(`اجرت با «عدم تمایل»: ${label}`);
      continue;
    }
    const group = defectGroupCode(line.group);
    const quick = (!!group && quickGroups.has(group)) || (!!name && isQuickServiceName(name));
    if (quick || (code && service.has(code)) || (!!name && isPeriodicServiceName(name))) {
      oilChange = true;
      if (quick) quickService = true;
      reasons.push(`اجرت سرویس دوره‌ای: ${label}`);
    } else {
      repair = true;
      reasons.push(`اجرت تعمیراتی: ${label}`);
    }
  }
  for (const part of parts) {
    const name = part.name?.trim() ? part.name : null;
    if ((part.code && oilParts.has(partKey(part.code))) || (!!name && isOilChangePartName(name))) {
      oilChange = true;
      reasons.push(`قطعه سرویس روغن: ${name ?? part.code}`);
    }
  }
  if (hall && isQuickServiceName(hall)) {
    quickService = true;
    reasons.push(`سالن تعمیرات: ${hall}`);
  }
  return { oilChange, repair, quickService, reasons, declined };
}

/**
 * Oil change / repair / quick service of one car from its labour names, the names of the parts it
 * actually used, and (when its column is confirmed) the card's «سالن تعمیرات». Not exclusive.
 * Names only (no codes): see `classifyCard` for cards read from کسب‌وکار.
 */
export function classifyJob(labourNames: string[], consumedParts: string[], hall?: string | null): JobClassification {
  const { oilChange, repair, quickService, reasons } = classifyCard(labourNames.map((name) => ({ name })), consumedParts.map((name) => ({ name })), hall, { serviceLabourCodes: [], quickServiceGroups: [], oilPartCodes: [] });
  return { oilChange, repair, quickService, reasons };
}
