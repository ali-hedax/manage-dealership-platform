import { classifyJob } from './service-classify';
import { toLatinDigits } from './text';

// Daily reception statistics of «پذیرش تا ترخیص» (reconstruction scenario, owner 2026-11-25).
// A reception whose labour lines are all periodic-service/oil codes counts as «سرویس»; any other
// labour code makes it «تعمیراتی». A reception without labour lines yet is «بدون اجرت» — it is
// never guessed. The service codes are a list the owner or system administrator edits.

export const RECEPTION_KINDS = ['repair', 'service', 'unclassified'] as const;
export type ReceptionKind = (typeof RECEPTION_KINDS)[number];
export const RECEPTION_KIND_LABELS: Record<ReceptionKind, string> = {
  repair: 'تعمیراتی',
  service: 'سرویس ادواری و روغن',
  unclassified: 'بدون اجرت',
};

/** Canonical labour code: ASCII digits, no spaces, upper case (codes are compared as text; leading zeros stay). */
export function normalizeLaborCode(code: string): string {
  return toLatinDigits(code).replace(/\s+/g, '').toUpperCase();
}

/** Codes typed or pasted by a person: comma, Persian comma, semicolon, space or new line separated; duplicates dropped. */
export function parseLaborCodes(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,،;؛]+/)) {
    const code = normalizeLaborCode(part);
    if (code) seen.add(code);
  }
  return [...seen];
}

/** Kind of one reception from the codes of its current (not removed) labour lines. */
export function receptionKind(codes: readonly (string | null | undefined)[], serviceCodes: Iterable<string>): ReceptionKind {
  const service = new Set([...serviceCodes].map(normalizeLaborCode));
  const present = codes.map((c) => (c == null ? '' : normalizeLaborCode(c))).filter(Boolean);
  if (!present.length) return 'unclassified';
  return present.every((c) => service.has(c)) ? 'service' : 'repair';
}

export interface ReceptionStatsRow {
  receptionist: string | null;
  /** Codes of the reception's current labour lines. */
  codes: readonly (string | null | undefined)[];
  /** Names (descriptions) of the current labour lines, for «تعویض روغن» / «تعمیر فنی» (classifyJob). */
  labourNames?: readonly (string | null | undefined)[];
  /** Names of the parts actually used on the card (see `isConsumedPart`). */
  consumedParts?: readonly (string | null | undefined)[];
}

/**
 * «گزارش شب» by job (owner, 2026-11-27): from labour names and used parts (`classifyJob`), not
 * from the service codes. Not exclusive: a car with an oil change and a repair is in both.
 * `none` = neither yet (no labour line and no oil part on the card).
 */
export interface ReceptionJobCounts {
  oilChange: number;
  technicalRepair: number;
  both: number;
  none: number;
}
export interface ReceptionJobPersonStats extends ReceptionJobCounts {
  name: string;
  total: number;
}

/** A part line counts as used: still on the card, not rejected, and a quantity above zero (final, else requested). */
export function isConsumedPart(p: { qtyFinal?: string | null; qtyRequested?: string | null; state?: string | null; rejectReason?: string | null; removed?: boolean }): boolean {
  if (p.removed || p.rejectReason?.trim()) return false;
  if (p.state && /رد\s*شده|ردشده/.test(p.state.replace(/‌/g, ''))) return false;
  const raw = p.qtyFinal?.trim() ? p.qtyFinal : p.qtyRequested;
  const qty = Number(toLatinDigits(raw ?? '').replace(/[,،٬\s]/g, ''));
  return Number.isFinite(qty) && qty > 0;
}

const clean = (names: readonly (string | null | undefined)[] | undefined) => (names ?? []).filter((n): n is string => !!n?.trim());
export interface ReceptionCounts {
  total: number;
  repair: number;
  service: number;
  unclassified: number;
}
export interface ReceptionPersonStats extends ReceptionCounts {
  /** As written in کسب‌وکار; «ثبت نشده» when the card has no receptionist. */
  name: string;
}
export interface ReceptionDayStats extends ReceptionCounts {
  /** Tehran calendar day, YYYY-MM-DD. */
  date: string;
  byReceptionist: ReceptionPersonStats[];
  /** False while no service code is set: then every reception with labour counts as «تعمیراتی». */
  serviceCodesConfigured: boolean;
  /** «تعویض روغن» / «تعمیر فنی» from labour names and used parts; a car may be in both. */
  jobs: ReceptionJobCounts;
  jobsByReceptionist: ReceptionJobPersonStats[];
}

export const UNKNOWN_RECEPTIONIST = 'ثبت نشده';

const empty = (): ReceptionCounts => ({ total: 0, repair: 0, service: 0, unclassified: 0 });
const emptyJobs = (): ReceptionJobCounts => ({ oilChange: 0, technicalRepair: 0, both: 0, none: 0 });

export function receptionDayStats(date: string, rows: readonly ReceptionStatsRow[], serviceCodes: readonly string[]): ReceptionDayStats {
  const service = new Set(serviceCodes.map(normalizeLaborCode).filter(Boolean));
  const all = empty();
  const people = new Map<string, ReceptionCounts>();
  const jobs = emptyJobs();
  const jobPeople = new Map<string, ReceptionJobCounts & { total: number }>();
  for (const row of rows) {
    const kind = receptionKind(row.codes, service);
    const name = row.receptionist?.replace(/\s+/g, ' ').trim() || UNKNOWN_RECEPTIONIST;
    const person = people.get(name) ?? empty();
    for (const c of [all, person]) {
      c.total += 1;
      c[kind] += 1;
    }
    people.set(name, person);
    const job = classifyJob(clean(row.labourNames), clean(row.consumedParts));
    const jobPerson = jobPeople.get(name) ?? { total: 0, ...emptyJobs() };
    jobPerson.total += 1;
    for (const c of [jobs, jobPerson]) {
      if (job.oilChange) c.oilChange += 1;
      if (job.repair) c.technicalRepair += 1;
      if (job.oilChange && job.repair) c.both += 1;
      if (!job.oilChange && !job.repair) c.none += 1;
    }
    jobPeople.set(name, jobPerson);
  }
  const byName = <T extends { name: string; total: number }>(a: T, b: T) => b.total - a.total || a.name.localeCompare(b.name, 'fa');
  const byReceptionist = [...people.entries()].map(([name, c]) => ({ name, ...c })).sort(byName);
  const jobsByReceptionist = [...jobPeople.entries()].map(([name, c]) => ({ name, ...c })).sort(byName);
  return { date, ...all, byReceptionist, serviceCodesConfigured: service.size > 0, jobs, jobsByReceptionist };
}
