import { formatJalaliDateInput, isWorkingDay, searchKey, TEHRAN_OFFSET_MINUTES, type KasbFieldMap, type PulseSettings, type WorkCalendar } from '@manage/shared';
import { idKey, isFullVin, isNonUniqueAdmission } from '../vehicle-import/vehicle-sheet';
import { CARD, CARD_DESCRIPTION_COLUMNS, CLOSED_STATUS_RE, CODE_DOMAIN_COLUMNS, CODE_TEXT_COLUMNS, CODE_VALUE_COLUMNS, DEFECT, PART, PART_NAME_COLUMNS, REPAIR, STATUS_DOMAIN } from './kasb-protocol';
import { cleanText, flagOf, idText, intOf, kasbInstant, pickText, quantityText, rowHash, type KasbRow, type KasbTable } from './kasb-table';

// From one row of کسب‌وکار to the columns Manage stores. Pure: no database, no network.
// Identifiers follow the vehicle-import rules (ASCII digits, no spaces or dashes, upper case,
// leading zeros kept; «بدون پذیرش»/«برگشتی» are not identifiers; a short chassis is not a VIN).

export interface ReceptionValues {
  kasbRcd: string;
  admissionNo: string | null;
  admissionNoKey: string | null;
  cardNo: string | null;
  chassis: string | null;
  vin: string | null;
  engineNo: string | null;
  productCode: string | null;
  productName: string | null;
  modelCode: string | null;
  modelName: string | null;
  color: string | null;
  plate: string | null;
  plateRegion: string | null;
  plateSection: string | null;
  plateLetter: string | null;
  plateThree: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerMobile: string | null;
  customerNationalId: string | null;
  customerAddress: string | null;
  delivererName: string | null;
  delivererMobile: string | null;
  entranceKm: number | null;
  admittedAt: Date | null;
  exitAt: Date | null;
  statusCode: string | null;
  station: string | null;
  receptionist: string | null;
  /** «سالن تعمیرات»: only from the column the administrator confirmed (KasbFieldMap.cardHall). */
  hall: string | null;
  searchText: string;
  official: KasbRow;
  rowHash: string;
}

/**
 * A column the administrator confirmed in «منبع‌ها» (S08). Unconfirmed: undefined, so the caller keeps
 * its earlier behaviour or leaves the field empty — a column of کسب‌وکار is never guessed.
 */
export function confirmedText(row: KasbRow, column: string | null | undefined): string | null | undefined {
  if (!column) return undefined;
  return cleanText(row[column]);
}

const digits = (v: string | null, length: number) => (v && /^\d+$/.test(v) && v.length <= length ? v.padStart(length, '0') : v);

/** Plate as the Plate component reads it («12 ب 345 67»); free text when a part is not standard. */
export function composePlate(section: string | null, letter: string | null, three: string | null, region: string | null): string | null {
  const parts = [digits(section, 2), letter, digits(three, 3), digits(region, 2)];
  if (parts.every((p) => !p)) return null;
  return parts.filter(Boolean).join(' ');
}

/** The admission matching key, or null for non-identifying numbers. */
export function admissionKey(admissionNo: string | null): string | null {
  if (!admissionNo || isNonUniqueAdmission(admissionNo)) return null;
  const key = idKey(admissionNo);
  return key || null;
}

/** A full 17-character VIN key, or null (a short ISACO chassis is never a VIN). */
export function fullVinKey(value: string | null): string | null {
  const key = value ? idKey(value) : '';
  return key && isFullVin(key) ? key : null;
}

/** One searchable string; fields are separated so a match never spans two of them. */
export function searchTextOf(values: (string | null | undefined)[]): string {
  return values.filter((v): v is string => !!v).map((v) => searchKey(v).replace(/~/g, '')).filter(Boolean).join('~');
}

export function mapCard(row: KasbRow, fields: KasbFieldMap = {}): ReceptionValues | null {
  const kasbRcd = idText(row[CARD.rcd]);
  if (!kasbRcd) return null;
  const admissionNo = idText(row[CARD.admissionNo]);
  const chassisRaw = idText(row[CARD.chassis]);
  const vinRaw = idText(row[CARD.vin]);
  const plateSection = idText(row[CARD.plateSection]);
  const plateLetter = cleanText(row[CARD.plateLetter]);
  const plateThree = idText(row[CARD.plateThree]);
  const plateRegion = idText(row[CARD.plateRegion]);
  const plate = composePlate(plateSection, plateLetter, plateThree, plateRegion);
  const values = {
    kasbRcd,
    admissionNo,
    admissionNoKey: admissionKey(admissionNo),
    cardNo: idText(row[CARD.docNo]),
    chassis: chassisRaw ? idKey(chassisRaw) : null,
    vin: vinRaw ? idKey(vinRaw) : null,
    engineNo: idText(row[CARD.engineNo]),
    productCode: idText(row[CARD.productCode]),
    productName: cleanText(row[CARD.productName]),
    modelCode: idText(row[CARD.modelCode]),
    modelName: cleanText(row[CARD.modelName]),
    color: cleanText(row[CARD.color]),
    plate,
    plateRegion,
    plateSection,
    plateLetter,
    plateThree,
    customerName: cleanText(row[CARD.customerName]),
    customerPhone: idText(row[CARD.phone]),
    customerMobile: idText(row[CARD.mobile]),
    customerNationalId: idText(row[CARD.nationalId]),
    customerAddress: cleanText(row[CARD.address]),
    delivererName: cleanText(row[CARD.delivererName]),
    delivererMobile: idText(row[CARD.delivererMobile]),
    entranceKm: intOf(row[CARD.entranceKm]),
    admittedAt: kasbInstant(row[CARD.rcptDate], row[CARD.rcptTime]),
    exitAt: kasbInstant(row[CARD.exitDate], row[CARD.exitTime]),
    statusCode: idText(row[CARD.status]),
    station: cleanText(row[CARD.station]),
    receptionist: cleanText(row[CARD.receptionist]),
    hall: confirmedText(row, fields.cardHall) ?? null,
    official: row,
    rowHash: rowHash(row),
  };
  return { ...values, searchText: searchTextOf([admissionNo, values.cardNo, plate, values.chassis, values.vin, values.customerName, values.productName, values.modelName]) };
}

/** Released (no longer «open»): an exit date in کسب‌وکار, or a closing official status text. */
export function isClosed(exitAt: Date | null, statusText: string | null): boolean {
  return !!exitAt || (!!statusText && CLOSED_STATUS_RE.test(statusText));
}

export const cardDescription = (official: KasbRow) => pickText(official, CARD_DESCRIPTION_COLUMNS);

// ------------------------------------------------------------ lines of a card

export interface LineBase {
  lineId: string;
  official: KasbRow;
  rowHash: string;
}
export interface PartValues extends LineBase {
  name: string | null;
  code: string | null;
  qtyRequested: string | null;
  qtyFinal: string | null;
  unitPriceRial: number | null;
  state: string | null;
  specialAid: boolean;
  warranty: string | null;
  rejectReason: string | null;
  repairLine: string | null;
}
export interface RepairValues extends LineBase {
  code: string | null;
  description: string | null;
  /** Labour name: the confirmed column, else the description (as before S08). */
  name: string | null;
  /** Technician and station of the line: only from confirmed columns. */
  technician: string | null;
  station: string | null;
  state: string | null;
  finalPriceRial: number | null;
  warranty: string | null;
  defectLine: string | null;
}
export interface DefectValues extends LineBase {
  customerText: string | null;
  expertText: string | null;
  state: string | null;
  type: string | null;
}

/** Line identity: the official line id, or (only if a row has none) a hash of the row. */
function base(row: KasbRow, idColumn: string): LineBase {
  const hash = rowHash(row);
  return { lineId: idText(row[idColumn]) ?? `h:${hash.slice(0, 24)}`, official: row, rowHash: hash };
}

export const mapPart = (row: KasbRow, fields: KasbFieldMap = {}): PartValues => ({
  ...base(row, PART.line),
  // A confirmed column wins (even when empty); before that the earlier candidate columns are used.
  name: fields.partName ? confirmedText(row, fields.partName) ?? null : pickText(row, PART_NAME_COLUMNS),
  code: idText(row[PART.code]),
  qtyRequested: quantityText(row[PART.qty]),
  qtyFinal: quantityText(row[PART.finalQty]),
  unitPriceRial: intOf(row[PART.unitPrice]),
  state: cleanText(row[PART.state]),
  specialAid: flagOf(row[PART.specialAid]),
  warranty: cleanText(row[PART.warranty]),
  rejectReason: cleanText(row[PART.rejectReason]),
  repairLine: idText(row[PART.repairLine]),
});
export const mapRepair = (row: KasbRow, fields: KasbFieldMap = {}): RepairValues => ({
  ...base(row, REPAIR.line),
  code: idText(row[REPAIR.code]),
  description: cleanText(row[REPAIR.description]),
  name: fields.repairName ? confirmedText(row, fields.repairName) ?? null : cleanText(row[REPAIR.description]),
  technician: confirmedText(row, fields.repairTechnician) ?? null,
  station: confirmedText(row, fields.repairStation) ?? null,
  state: cleanText(row[REPAIR.state]),
  finalPriceRial: intOf(row[REPAIR.finalPrice]),
  warranty: cleanText(row[REPAIR.warranty]),
  defectLine: idText(row[REPAIR.defectLine]),
});
export const mapDefect = (row: KasbRow): DefectValues => ({
  ...base(row, DEFECT.line),
  customerText: cleanText(row[DEFECT.customer]),
  expertText: cleanText(row[DEFECT.expert]),
  state: cleanText(row[DEFECT.state]),
  type: cleanText(row[DEFECT.type]),
});

export interface StoredLine {
  id: string;
  lineId: string;
  rowHash: string;
  removedAt: Date | null;
}
export interface LineDiff<T extends LineBase> {
  added: T[];
  changed: { stored: StoredLine; next: T }[];
  restored: { stored: StoredLine; next: T }[];
  removed: StoredLine[];
}

/**
 * Compares the stored lines of a card with a fresh answer. Unchanged lines produce nothing; a
 * line missing from the answer is marked «removed in کسب‌وکار» (never deleted); a removed line
 * that comes back is restored.
 */
export function diffLines<T extends LineBase>(stored: readonly StoredLine[], incoming: readonly T[]): LineDiff<T> {
  const next = new Map<string, T>();
  for (const line of incoming) if (!next.has(line.lineId)) next.set(line.lineId, line);
  const known = new Map(stored.map((s) => [s.lineId, s]));
  const out: LineDiff<T> = { added: [], changed: [], restored: [], removed: [] };
  for (const [id, line] of next) {
    const s = known.get(id);
    if (!s) out.added.push(line);
    else if (s.removedAt) out.restored.push({ stored: s, next: line });
    else if (s.rowHash !== line.rowHash) out.changed.push({ stored: s, next: line });
  }
  for (const s of stored) if (!s.removedAt && !next.has(s.lineId)) out.removed.push(s);
  return out;
}

// ------------------------------------------------------------ status texts

/** Official texts of the admission status codes from Sec/Code (domain CAR_STATE_REC). */
/**
 * Every code domain of the reference answer (Sec/Code): domain → code → official text (H4 part 3). The
 * same answer Pulse already reads for the status texts; nothing new is asked of کسب‌وکار.
 */
export function codeDomains(table: KasbTable): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of table.rows) {
    const domain = pickText(row, CODE_DOMAIN_COLUMNS);
    const code = idText(row[CODE_VALUE_COLUMNS.find((c) => row[c] != null) ?? CODE_VALUE_COLUMNS[0]]);
    const text = pickText(row, CODE_TEXT_COLUMNS);
    if (domain && code && text) (out[domain] ??= {})[code] = text;
  }
  return out;
}

export function statusTexts(table: KasbTable): Record<string, string> {
  return codeDomains(table)[STATUS_DOMAIN] ?? {};
}

// ------------------------------------------------------------ days and hours (Tehran)

const OFFSET = TEHRAN_OFFSET_MINUTES * 60_000;
const DAY = 86_400_000;

/** Jalali day of an instant in the form کسب‌وکار expects: "1405/09/02". */
export const jalaliDay = (d: Date) => formatJalaliDateInput(d);
/** Gregorian YYYY-MM-DD of the Tehran day (work calendar keys). */
export const tehranDateKey = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
/** UTC instant of Tehran midnight starting the day of `d`. */
export const tehranMidnight = (d: Date) => new Date(Math.floor((d.getTime() + OFFSET) / DAY) * DAY - OFFSET);

/** Consecutive Tehran-day ranges of at most `size` days from `from` to `to`, newest last. */
export function dayChunks(from: Date, to: Date, size: number): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = [];
  let start = tehranMidnight(from);
  const last = tehranMidnight(to);
  while (start.getTime() <= last.getTime()) {
    const end = new Date(Math.min(start.getTime() + (size - 1) * DAY, last.getTime()));
    out.push({ from: start, to: end });
    start = new Date(end.getTime() + DAY);
  }
  return out;
}

/**
 * Whether the worker reads now. Calendar mode: a working day of the dealership calendar,
 * from one hour before its first period until one hour after its last. Custom mode: the given
 * hours on working days.
 */
export function withinWorkingHours(now: Date, settings: PulseSettings, calendar: WorkCalendar): boolean {
  const key = tehranDateKey(now);
  if (!isWorkingDay(key, calendar)) return false;
  const local = new Date(now.getTime() + OFFSET);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (settings.hoursMode === 'custom') {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    return minute >= toMin(settings.hoursFrom) && minute <= toMin(settings.hoursTo);
  }
  const periods = calendar.week[local.getUTCDay()] ?? [];
  if (!periods.length) return false;
  return minute >= Math.min(...periods.map((p) => p.start)) - 60 && minute <= Math.max(...periods.map((p) => p.end)) + 60;
}
