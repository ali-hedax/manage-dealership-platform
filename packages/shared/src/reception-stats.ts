import { DEFAULT_JOB_CODES } from './service-classify.config';
import { classifyCard, type JobCodes, type JobLabourLine, type JobPartLine } from './service-classify';
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
  /** Current labour lines with code, name, defect group and state (H4 part 1: codes first). */
  labour?: readonly JobLabourLine[];
  /** Parts actually used, with code and name. */
  parts?: readonly JobPartLine[];
  /**
   * The physical car (full VIN, else chassis, else plate). Receptions of one car on one day are one car
   * in each job count (owner, 2026-11-28: «یک خودرو در هر دسته فقط یک بار»). Missing: the row is its own car.
   */
  vehicleKey?: string | null;
  /** «سالن تعمیرات» of the card, once its column in کسب‌وکار is confirmed (quick service hall). */
  hall?: string | null;
  /** Current labour lines whose name is missing in the source (only a code): counted, never guessed. */
  labourWithoutName?: number;
  /** Current part lines without a name in the source. */
  partsWithoutName?: number;
  /** False while Pulse has not read the card's labour and parts yet. */
  linesRead?: boolean;
}

/**
 * «گزارش شب» by job (owner, 2026-11-27): from labour names and used parts (`classifyJob`), not
 * from the service codes. Not exclusive: a car with an oil change and a repair is in both.
 * `none` = neither yet (no labour line and no oil part on the card).
 */
export interface ReceptionJobCounts {
  /** «سرویس سریع» (labour name, or the quick-service hall once its column is confirmed). */
  quickService: number;
  oilChange: number;
  technicalRepair: number;
  both: number;
  none: number;
  /** Distinct cars behind the counts (each car once per category). */
  vehicles: number;
}
export interface ReceptionJobPersonStats extends ReceptionJobCounts {
  name: string;
  /** Receptions of this receptionist that day. */
  total: number;
}
/**
 * What the counts could not see (S08/S09: shown, never guessed): receptions whose labour and parts
 * Pulse has not read yet, labour lines with only a code, and part lines without a name.
 */
export interface ReceptionDataGaps {
  linesNotRead: number;
  labourWithoutName: number;
  partsWithoutName: number;
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
  dataGaps: ReceptionDataGaps;
  /** Labour lines the customer refused («عدم تمایل به انجام تعمیر») on these receptions: never counted as work. */
  declinedLabour: number;
  /** Labour lines waiting for special aid («امداد ویژه»): not counted as technical repair done. */
  specialAidLabour: number;
}

export const UNKNOWN_RECEPTIONIST = 'ثبت نشده';

const empty = (): ReceptionCounts => ({ total: 0, repair: 0, service: 0, unclassified: 0 });
const emptyJobs = (): ReceptionJobCounts => ({ quickService: 0, oilChange: 0, technicalRepair: 0, both: 0, none: 0, vehicles: 0 });

interface CarDay { labour: JobLabourLine[]; parts: JobPartLine[]; halls: string[] }
/** The lines of a row: structured lines when given, else the names alone (older callers). */
const labourOf = (row: ReceptionStatsRow): JobLabourLine[] => (row.labour ? [...row.labour] : clean(row.labourNames).map((name) => ({ name })));
const partsOf = (row: ReceptionStatsRow): JobPartLine[] => (row.parts ? [...row.parts] : clean(row.consumedParts).map((name) => ({ name })));
const addCar = (cars: Map<string, CarDay>, key: string, row: ReceptionStatsRow) => {
  const car = cars.get(key) ?? { labour: [], parts: [], halls: [] };
  car.labour.push(...labourOf(row));
  car.parts.push(...partsOf(row));
  if (row.hall?.trim()) car.halls.push(row.hall);
  cars.set(key, car);
};
function countCars(cars: Map<string, CarDay>, into: ReceptionJobCounts, codes: JobCodes) {
  for (const car of cars.values()) {
    const job = classifyCard(car.labour, car.parts, car.halls.find(Boolean) ?? null, codes);
    // Any of the car's cards in the quick-service hall makes it a quick service.
    const quick = job.quickService || car.halls.some((h) => classifyCard([], [], h, codes).quickService);
    into.vehicles += 1;
    if (quick) into.quickService += 1;
    if (job.oilChange) into.oilChange += 1;
    if (job.repair) into.technicalRepair += 1;
    if (job.oilChange && job.repair) into.both += 1;
    if (!job.oilChange && !job.repair && !quick) into.none += 1;
  }
}

/**
 * `serviceCodes`: labour codes of periodic service and oil change; `codes`: the quick-service defect
 * groups and oil part codes (defaults in DEFAULT_JOB_CODES).
 */
export function receptionDayStats(date: string, rows: readonly ReceptionStatsRow[], serviceCodes: readonly string[], codes: Partial<Omit<JobCodes, 'serviceLabourCodes'>> = {}): ReceptionDayStats {
  const service = new Set(serviceCodes.map(normalizeLaborCode).filter(Boolean));
  const jobCodes: JobCodes = { serviceLabourCodes: [...service], quickServiceGroups: codes.quickServiceGroups ?? DEFAULT_JOB_CODES.quickServiceGroups, oilPartCodes: codes.oilPartCodes ?? DEFAULT_JOB_CODES.oilPartCodes };
  let declinedLabour = 0, specialAidLabour = 0;
  const all = empty();
  const people = new Map<string, ReceptionCounts>();
  const cars = new Map<string, CarDay>();
  const personCars = new Map<string, { total: number; cars: Map<string, CarDay> }>();
  const dataGaps: ReceptionDataGaps = { linesNotRead: 0, labourWithoutName: 0, partsWithoutName: 0 };
  rows.forEach((row, index) => {
    // Cards with structured lines: kind from the same rule as the job counts (codes, groups, refused lines left out).
    let kind = receptionKind(row.codes, service);
    if (row.labour) {
      const own = classifyCard(row.labour, [], null, jobCodes);
      declinedLabour += own.declined;
      specialAidLabour += own.specialAid;
      kind = own.repair ? 'repair' : own.oilChange ? 'service' : 'unclassified';
    }
    const name = row.receptionist?.replace(/\s+/g, ' ').trim() || UNKNOWN_RECEPTIONIST;
    const person = people.get(name) ?? empty();
    for (const c of [all, person]) {
      c.total += 1;
      c[kind] += 1;
    }
    people.set(name, person);
    const car = row.vehicleKey?.trim() || `row:${index}`;
    addCar(cars, car, row);
    const mine = personCars.get(name) ?? { total: 0, cars: new Map<string, CarDay>() };
    mine.total += 1;
    addCar(mine.cars, car, row);
    personCars.set(name, mine);
    if (row.linesRead === false) dataGaps.linesNotRead += 1;
    dataGaps.labourWithoutName += row.labourWithoutName ?? 0;
    dataGaps.partsWithoutName += row.partsWithoutName ?? 0;
  });
  const jobs = emptyJobs();
  countCars(cars, jobs, jobCodes);
  const byName = <T extends { name: string; total: number }>(a: T, b: T) => b.total - a.total || a.name.localeCompare(b.name, 'fa');
  const byReceptionist = [...people.entries()].map(([name, c]) => ({ name, ...c })).sort(byName);
  const jobsByReceptionist = [...personCars.entries()].map(([name, p]) => {
    const counts = emptyJobs();
    countCars(p.cars, counts, jobCodes);
    return { name, total: p.total, ...counts };
  }).sort(byName);
  return { date, ...all, byReceptionist, serviceCodesConfigured: service.size > 0, jobs, jobsByReceptionist, dataGaps, declinedLabour, specialAidLabour };
}
