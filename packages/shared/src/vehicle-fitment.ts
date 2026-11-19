/**
 * Vehicle compatibility for the smart accident assessment (owner, 2026-11-19).
 *
 * The only compatibility data Manage holds is the catalog's «مصرف خودرو» label of each
 * reference part (a vehicle family such as «دنا»، «دنا پلاس»، «پژو پارس»). A case is
 * matched to exactly one catalog family from its own model/trim text and, when the VIN
 * or chassis is in the dealership's admission records, from that record too. Nothing is
 * guessed: no family, two different families, or case and VIN disagreeing all mean
 * «not verified», and the search then shows nothing rather than another car's parts.
 */
import { normalizeAssessmentSearch } from './assessment-search';
import { toLatinDigits } from './text';

/** Catalog labels that are explicitly valid for every platform. */
export const COMMON_FITMENT_LABELS = ['خودروهای رایج-صرفنظراز پلتفرم'] as const;
/** Catalog labels that carry no compatibility information. */
const NO_FITMENT = new Set(['', 'نامشخص'].map((x) => normalizeAssessmentSearch(x)));
const COMMON = new Set(COMMON_FITMENT_LABELS.map((x) => normalizeAssessmentSearch(x)));
/** Make words that may be missing from a case's model text («207» for «پژو 207»). */
const MAKE_WORDS = ['پژو', 'هایما', 'دانگفنگ', 'رنو', 'ایرانخودرو', 'خودروبرقی'];

export const fitmentKey = (label: string | null | undefined) => normalizeAssessmentSearch(label ?? '');
export const isCommonFitment = (label: string | null | undefined) => COMMON.has(fitmentKey(label));
export const hasFitment = (label: string | null | undefined) => !NO_FITMENT.has(fitmentKey(label));

export type FitmentResolution =
  | { status: 'verified'; family: string; source: 'case' | 'vin' | 'case+vin' }
  | { status: 'unresolved'; candidates: string[] }
  | { status: 'conflict'; candidates: string[] };

const isAlnumLatin = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);

/** Normalized aliases of one catalog family: the label, and without a leading/trailing make word. */
function aliases(key: string): string[] {
  const out = new Set([key]);
  for (const w of MAKE_WORDS) {
    if (key.startsWith(w) && key.length - w.length >= 3) out.add(key.slice(w.length));
    if (key.endsWith(w) && key.length - w.length >= 3) out.add(key.slice(0, -w.length));
  }
  return [...out];
}

/** Families whose alias occurs in one text, longest match winning over a match inside it. */
function familiesIn(text: string, families: readonly string[]): string[] {
  const t = fitmentKey(toLatinDigits(text));
  if (!t) return [];
  const hits: { family: string; start: number; end: number }[] = [];
  for (const family of families) {
    for (const a of aliases(family)) {
      for (let i = t.indexOf(a); i >= 0; i = t.indexOf(a, i + 1)) {
        const end = i + a.length;
        // A Latin/digit alias («207», «s7», «rd») must not be part of a longer code.
        if (isAlnumLatin(a[0]) && isAlnumLatin(t[i - 1])) continue;
        if (isAlnumLatin(a[a.length - 1]) && isAlnumLatin(t[end])) continue;
        hits.push({ family, start: i, end });
      }
    }
  }
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.family !== h.family && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start));
  return [...new Set(kept.map((h) => h.family))];
}

/** One family from several texts of the same source (model and trim). */
function resolveTexts(texts: readonly (string | null | undefined)[], families: readonly string[]): string[] {
  const found = new Set<string>();
  for (const x of texts) for (const f of familiesIn(x ?? '', families)) found.add(f);
  // A family that only appears as a part of another found family's name is that family.
  return [...found].filter((f) => ![...found].some((o) => o !== f && o.includes(f)));
}

/**
 * The catalog family of a case. `labels` are the catalog's «مصرف خودرو» values;
 * `vinTexts` are model/trim texts of admission records with the same VIN or chassis.
 */
export function resolveVehicleFamily(caseTexts: readonly (string | null | undefined)[], vinTexts: readonly (string | null | undefined)[], labels: readonly string[]): FitmentResolution {
  const families = [...new Set(labels.map(fitmentKey).filter((k) => !NO_FITMENT.has(k) && !COMMON.has(k)))];
  const fromCase = resolveTexts(caseTexts, families);
  const fromVin = resolveTexts(vinTexts, families);
  if (fromCase.length > 1) return { status: 'unresolved', candidates: fromCase };
  if (fromVin.length > 1) return { status: 'conflict', candidates: fromVin };
  const [c] = fromCase, [v] = fromVin;
  if (c && v && c !== v) return { status: 'conflict', candidates: [c, v] };
  if (c) return { status: 'verified', family: c, source: v ? 'case+vin' : 'case' };
  if (v) return { status: 'verified', family: v, source: 'vin' };
  return { status: 'unresolved', candidates: [] };
}

/**
 * Assessment reference of a technical code: the first 8 digits of the normalized code
 * («0021436501» → «00214365»). Codes that do not start with 8 digits have no reference
 * and are kept as typed. The full code is always kept beside it.
 */
export function assessmentReference(code: string | null | undefined): string | null {
  const n = toLatinDigits(code ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return /^\d{8}/.test(n) ? n.slice(0, 8) : null;
}

/** The normalized full code (digits Latin, separators removed, upper case). */
export const normalizedPartCode = (code: string | null | undefined) => toLatinDigits(code ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
