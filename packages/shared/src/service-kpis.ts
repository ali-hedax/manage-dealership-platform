// The four approved service-manager numbers (owner, 2026-11-18). One definition
// for the dashboard, the manager report and its Excel/PDF export: each number is
// the size of an exact list, and the list is what a click on the number opens.
//
// Rows are active cases (open and not delivered, soft-deleted excluded).

export const SERVICE_KPI_KEYS = ['present', 'overdue_official', 'unassigned', 'blocked'] as const;
export type ServiceKpiKey = (typeof SERVICE_KPI_KEYS)[number];

export interface ServiceKpiDefinition {
  label: string;
  /** What is counted: a vehicle once, or each case. */
  unit: 'خودرو' | 'پرونده';
  definition: string;
  /** Filter of the case list and report items for the same rows. */
  listQuery: string;
}

export const SERVICE_KPIS: Record<ServiceKpiKey, ServiceKpiDefinition> = {
  present: { label: 'خودروهای حاضر', unit: 'خودرو', definition: 'خودروهای متمایز دارای پروندهٔ باز و تحویل‌نشده؛ هر خودرو یک بار', listQuery: '' },
  overdue_official: { label: 'گذشته از مهلت رسمی', unit: 'پرونده', definition: 'پرونده‌های فعالی که مهلت رسمی ثبت‌شده‌شان گذشته است (پیش‌بینی داخلی حساب نمی‌شود)', listQuery: 'flag=overdue_official' },
  unassigned: { label: 'بدون مسئول', unit: 'پرونده', definition: 'پرونده‌های فعالی که مسئول پرونده ندارند', listQuery: 'flag=unassigned' },
  blocked: { label: 'دارای مانع', unit: 'خودرو', definition: 'خودروهای متمایز با حداقل یک مانع باز ثبت‌شده؛ هر خودرو یک بار', listQuery: 'flag=blocked' },
};

export interface ServiceKpiRow {
  caseId: string;
  vehicleId: string;
  officialDeadlineAt: string | Date | null;
  responsibleUserId: string | null;
  openBlockers: number;
}

const ms = (d: string | Date) => (typeof d === 'string' ? Date.parse(d) : d.getTime());

/** Case ids behind each number; vehicle-counted numbers keep one case per vehicle (the first in row order). */
export function serviceKpiMembers(rows: readonly ServiceKpiRow[], now: Date | number = Date.now()): Record<ServiceKpiKey, string[]> {
  const t = typeof now === 'number' ? now : now.getTime();
  const perVehicle = (list: readonly ServiceKpiRow[]) => {
    const seen = new Set<string>();
    return list.filter((r) => !seen.has(r.vehicleId) && !!seen.add(r.vehicleId)).map((r) => r.caseId);
  };
  return {
    present: perVehicle(rows),
    overdue_official: rows.filter((r) => r.officialDeadlineAt != null && ms(r.officialDeadlineAt) < t).map((r) => r.caseId),
    unassigned: rows.filter((r) => !r.responsibleUserId).map((r) => r.caseId),
    blocked: perVehicle(rows.filter((r) => r.openBlockers > 0)),
  };
}

/** One number of the strip with the exact rows it counts. */
export interface ServiceKpi extends ServiceKpiDefinition {
  key: ServiceKpiKey;
  count: number;
  items: { caseId: string; caseNumber: string; plate: string | null; vehicle: string; responsibleName: string | null; officialDeadlineAt: string | null; openBlockers: number }[];
}

/** «پیگیری امروز»: what the service manager follows up today, most urgent first. */
export interface FollowUpItem {
  caseId: string;
  caseNumber: string;
  plate: string | null;
  vehicle: string;
  coverageType: import('./enums').CoverageType;
  bodyReplacement: boolean;
  /** Why it is on today's list (one short Persian phrase). */
  reason: string;
  /** Current step or operation. */
  operation: string;
  responsibleName: string | null;
  /** The time that matters today (deadline, planned end or blocker start). */
  dueAt: string | null;
  tone: 'stop' | 'warn' | 'ok';
}

const TEHRAN_MS = 210 * 60_000;
const tehranDay = (t: number) => Math.floor((t + TEHRAN_MS) / 86_400_000);

/**
 * «پیگیری امروز» of the service manager, from the same folder facts as the desks:
 * an open blocker or a stop first, then a passed official deadline, behind plan,
 * no follow-up owner, a step planned to end today, and cars ready for delivery.
 */
export function buildFollowUps(folders: readonly import('./desk').DeskFolder[], now = Date.now()): FollowUpItem[] {
  const today = tehranDay(now);
  const out: (FollowUpItem & { rank: number })[] = [];
  for (const f of folders) {
    const openEnds = f.tasks.filter((t) => t.status !== 'done' && t.status !== 'approved' && t.plannedEndAt).map((t) => t.plannedEndAt!).sort();
    const overdue = !!f.officialDeadlineAt && Date.parse(f.officialDeadlineAt) < now;
    const endsToday = openEnds.some((e) => tehranDay(Date.parse(e)) === today);
    let rank = -1, reason = '', tone: FollowUpItem['tone'] = 'warn';
    if (f.openBlockers > 0 || f.next.tone === 'stop') { rank = 0; reason = f.openBlockers > 0 ? 'مانع باز ثبت‌شده' : f.next.text; tone = 'stop'; }
    else if (overdue) { rank = 1; reason = 'گذشته از مهلت رسمی'; tone = 'stop'; }
    else if (f.behind) { rank = 2; reason = 'عقب‌تر از برنامه'; }
    else if (!f.responsibleUserId) { rank = 3; reason = 'بدون مسئول پرونده'; }
    else if (endsToday) { rank = 4; reason = 'پایان برنامه امروز'; tone = 'ok'; }
    else if (f.journey === 'delivery') { rank = 5; reason = 'آمادهٔ کنترل و تحویل'; tone = 'ok'; }
    if (rank < 0) continue;
    out.push({
      rank,
      caseId: f.caseId,
      caseNumber: f.caseNumber,
      plate: f.plate,
      vehicle: f.vehicle,
      coverageType: f.coverageType,
      bodyReplacement: f.bodyReplacement,
      reason,
      operation: f.place,
      responsibleName: f.responsibleName,
      dueAt: overdue || rank === 1 ? f.officialDeadlineAt : openEnds[0] ?? f.officialDeadlineAt,
      tone,
    });
  }
  return out
    .sort((a, b) => a.rank - b.rank || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))
    .map(({ rank: _rank, ...item }) => item);
}
