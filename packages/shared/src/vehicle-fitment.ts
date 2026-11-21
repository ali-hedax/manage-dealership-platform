/**
 * Vehicle compatibility for the smart accident assessment (owner, 2026-11-19; family
 * matching 2026-11-21).
 *
 * The only compatibility data Manage holds is the catalog's «مصرف خودرو» label of each
 * reference part («دنا»، «دنا پلاس»، «سورن پلاس»، «پژو207»…). Labels are grouped into
 * vehicle families by a short, explicit list (FAMILY_DEFS) checked against the real
 * catalog; a label outside it is its own family. A case is matched to exactly one family
 * from its model/trim text and, when the VIN or chassis is in the admission records, from
 * that record too. Within the family:
 *  - the label that matches the case's own text best is «exact» (normal selection),
 *  - explicitly common labels are «common»,
 *  - every other label of the family is shown with «نیازمند بررسی تطابق با تیپ خودرو»,
 *    so a trim suffix («ELX»، «توربو»، «اتوماتیک») never hides the family's parts and a
 *    part is never claimed to fit a trim it was not catalogued for.
 * No family, two different families, or case and VIN naming different families mean
 * «not verified», and the search then shows nothing rather than another car's parts.
 *
 * Matching keeps word boundaries: a number matches only as a whole number («207» in
 * «207i» or «پژو 207», never in «2007» or «2690530»), a Latin code is not part of a longer
 * code, and a Persian name must start a word («تارا» never inside «ستارا»).
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

/**
 * Vehicle families whose catalog labels differ only by trim, engine or gearbox (checked
 * against the dealership catalog, 2026-11-21). The name is shown to the expert.
 */
export const FAMILY_DEFS: readonly { name: string; aliases: readonly string[] }[] = [
  { name: 'سورن', aliases: ['سورن'] },
  { name: 'دنا', aliases: ['دنا'] },
  { name: 'رانا', aliases: ['رانا'] },
  { name: 'تارا', aliases: ['تارا'] },
  { name: 'سمند', aliases: ['سمند'] },
  { name: 'پژو 207', aliases: ['پژو 207', '207'] },
  { name: 'هایما S7', aliases: ['هایما S7', 'S7'] },
  { name: 'هایما S5', aliases: ['هایما S5', 'S5'] },
  { name: 'دانگ فنگ شاین مکس (G35)', aliases: ['شاین مکس', 'G35'] },
];

/** Shown on a family part whose catalog label is another trim of the case's family. */
export const TRIM_REVIEW_LABEL = 'نیازمند بررسی تطابق با تیپ خودرو';

export const fitmentKey = (label: string | null | undefined) => normalizeAssessmentSearch(label ?? '');
export const isCommonFitment = (label: string | null | undefined) => COMMON.has(fitmentKey(label));
export const hasFitment = (label: string | null | undefined) => !NO_FITMENT.has(fitmentKey(label));

export type FitmentResolution =
  | {
    status: 'verified';
    /** Family key (normalized family name). */
    family: string;
    familyName: string;
    /** Normalized catalog label matching the vehicle's own text, or null when none does (or case and VIN name different trims). */
    label: string | null;
    source: 'case' | 'vin' | 'case+vin';
  }
  | { status: 'unresolved'; candidates: string[] }
  | { status: 'conflict'; candidates: string[] };

/** How a catalog part relates to the resolved vehicle. */
export type PartFitment = 'exact' | 'common' | 'review';

// ------------------------------------------------------------------ matching

interface Prepared { t: string; seps: Set<number> }
const cls = (c: string | undefined) => (c === undefined ? '' : /[0-9]/.test(c) ? 'd' : /[a-z]/.test(c) ? 'l' : 'p');

/** Normalized text with the positions where the original had a separator. */
function prepare(text: string | null | undefined): Prepared {
  let t = '';
  const seps = new Set<number>();
  for (const chunk of toLatinDigits(text ?? '').split(/[\s\p{P}\p{S}‌]+/u)) {
    const n = normalizeAssessmentSearch(chunk);
    if (!n) continue;
    seps.add(t.length);
    t += n;
  }
  return { t, seps };
}
const boundary = (p: Prepared, i: number) => i <= 0 || i >= p.t.length || p.seps.has(i) || cls(p.t[i - 1]) !== cls(p.t[i]);

/** Occurrences of `alias` starting a word and ending a word (a Persian name may carry a glued suffix: «دناپلاس»). */
function occurrences(p: Prepared, alias: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (!alias) return out;
  for (let i = p.t.indexOf(alias); i >= 0; i = p.t.indexOf(alias, i + 1)) {
    const end = i + alias.length;
    if (!boundary(p, i)) continue;
    if (!boundary(p, end) && cls(alias[alias.length - 1]) !== 'p') continue;
    out.push({ start: i, end });
  }
  return out;
}

/** Ids whose alias occurs in the texts; a match inside a longer match of another id does not count. */
function matchIds(texts: readonly (string | null | undefined)[], entries: readonly { id: string; alias: string }[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    const p = prepare(text);
    if (!p.t) continue;
    const hits: { id: string; start: number; end: number }[] = [];
    for (const e of entries) for (const o of occurrences(p, e.alias)) hits.push({ id: e.id, ...o });
    for (const h of hits) {
      if (!hits.some((o) => o.id !== h.id && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start)) found.add(h.id);
    }
  }
  return [...found];
}

/** Normalized aliases of a catalog label: the label, and without a leading/trailing make word. */
function labelAliases(key: string): string[] {
  const out = new Set([key]);
  const add = (rest: string) => { if (rest.length >= 3 && !GENERIC_WORDS.has(rest)) out.add(rest); };
  for (const w of MAKE_WORDS) {
    if (key.startsWith(w)) add(key.slice(w.length));
    if (key.endsWith(w)) add(key.slice(0, -w.length));
  }
  return [...out];
}
/**
 * Ordinary trim words that are not a vehicle name once the make word is removed
 * («دانگ فنگ برقی» → «برقی» would match every «فرمان برقی» or «دریچه گاز برقی»).
 */
const GENERIC_WORDS = new Set(['برقی', 'بنزینی', 'هیبریدی', 'دیزلی', 'دوگانهسوز', 'اتوماتیک', 'دستی', 'توربو', 'پلاس'].map((x) => normalizeAssessmentSearch(x)));

const DEFS = FAMILY_DEFS.map((d) => ({ key: fitmentKey(d.name), name: d.name, aliases: d.aliases.map(fitmentKey) }));

export interface FitmentCatalog {
  /** Family of a catalog label (null for common or unlabelled parts). */
  familyOf(label: string | null | undefined): { key: string; name: string } | null;
  /** The catalog labels of one family. */
  labelsOf(family: string): string[];
}
type Entry = { id: string; alias: string };
interface Catalog extends FitmentCatalog { familyEntries: Entry[]; labelEntries: (Entry & { family: string })[]; names: Map<string, string> }

/** Groups the catalog's «مصرف خودرو» labels into families. */
export function fitmentCatalog(labels: readonly string[]): Catalog {
  const byLabel = new Map<string, { key: string; name: string }>();
  const names = new Map<string, string>();
  const familyEntries: Entry[] = [];
  const labelEntries: (Entry & { family: string })[] = [];
  for (const d of DEFS) { names.set(d.key, d.name); for (const a of d.aliases) familyEntries.push({ id: d.key, alias: a }); }
  for (const raw of labels) {
    const key = fitmentKey(raw);
    if (NO_FITMENT.has(key) || COMMON.has(key) || byLabel.has(key)) continue;
    const p = prepare(raw);
    let best: { d: (typeof DEFS)[number]; len: number } | null = null;
    for (const d of DEFS) for (const a of d.aliases) if (occurrences(p, a).length && (!best || a.length > best.len)) best = { d, len: a.length };
    const family = best ? { key: best.d.key, name: best.d.name } : { key, name: raw.trim() };
    byLabel.set(key, family);
    if (!best) names.set(key, family.name);
    for (const a of labelAliases(key)) {
      if (!best) familyEntries.push({ id: key, alias: a });
      labelEntries.push({ id: key, alias: a, family: family.key });
    }
  }
  return {
    familyEntries, labelEntries, names,
    familyOf: (label) => byLabel.get(fitmentKey(label)) ?? null,
    labelsOf: (family) => labels.filter((l) => byLabel.get(fitmentKey(l))?.key === family),
  };
}

/** The family named by the texts of one source, and that source's most specific catalog label in it. */
function resolveSource(texts: readonly (string | null | undefined)[], catalog: Catalog) {
  const families = matchIds(texts, catalog.familyEntries);
  if (families.length !== 1) return { families, label: null as string | null };
  const family = families[0]!;
  const labels = matchIds(texts, catalog.labelEntries.filter((e) => e.family === family));
  // A label contained in another found label is that label («دنا» inside «دنا پلاس»).
  const specific = labels.filter((l) => !labels.some((o) => o !== l && o.includes(l)));
  return { families, label: specific.length === 1 ? specific[0]! : null };
}

/**
 * The catalog family of a case. `labels` are the catalog's «مصرف خودرو» values;
 * `vinTexts` are model/trim texts of admission records with the same VIN or chassis.
 */
export function resolveVehicleFamily(caseTexts: readonly (string | null | undefined)[], vinTexts: readonly (string | null | undefined)[], labels: readonly string[], catalog: Catalog = fitmentCatalog(labels)): FitmentResolution {
  const fromCase = resolveSource(caseTexts, catalog);
  const fromVin = resolveSource(vinTexts, catalog);
  if (fromCase.families.length > 1) return { status: 'unresolved', candidates: fromCase.families };
  if (fromVin.families.length > 1) return { status: 'conflict', candidates: fromVin.families };
  const [c] = fromCase.families, [v] = fromVin.families;
  if (c && v && c !== v) return { status: 'conflict', candidates: [c, v] };
  const family = c ?? v;
  if (!family) return { status: 'unresolved', candidates: [] };
  // Case and VIN record naming different trims of one family: every family part needs a trim check.
  const label = c && v
    ? (fromCase.label && fromVin.label && fromCase.label !== fromVin.label ? null : fromCase.label ?? fromVin.label)
    : c ? fromCase.label : fromVin.label;
  return { status: 'verified', family, familyName: catalog.names.get(family) ?? family, label, source: c && v ? 'case+vin' : c ? 'case' : 'vin' };
}

/** How a part with catalog label `vehicleUse` fits the resolved vehicle; null = another vehicle (never offered). */
export function partFitment(vehicleUse: string | null | undefined, fit: FitmentResolution, catalog: FitmentCatalog): PartFitment | null {
  if (isCommonFitment(vehicleUse)) return 'common';
  if (fit.status !== 'verified' || catalog.familyOf(vehicleUse)?.key !== fit.family) return null;
  return fit.label && fitmentKey(vehicleUse) === fit.label ? 'exact' : 'review';
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
