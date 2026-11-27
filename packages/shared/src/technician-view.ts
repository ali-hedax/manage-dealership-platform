import { toPersianDigits } from './text';

// What a technician sees on a job (owner, 2026-11-27): plate, short vehicle name, priority, the
// deadline in days and the start / finish buttons — never a wage or any other amount.

export const TECHNICIAN_PRIORITIES = ['urgent', 'today', 'normal'] as const;
export type TechnicianPriority = (typeof TECHNICIAN_PRIORITIES)[number];
export const TECHNICIAN_PRIORITY_LABELS: Record<TechnicianPriority, string> = {
  urgent: 'فوری',
  today: 'امروز',
  normal: 'عادی',
};

export interface TechnicianDue {
  priority: TechnicianPriority;
  /** Whole Tehran calendar days until the planned end (0 = today, negative = overdue); null without a deadline. */
  daysLeft: number | null;
  /** «۲ روز»، «امروز»، «۳ روز گذشته» or «بدون مهلت». */
  daysText: string;
}

const DAY = 86_400_000;
const TEHRAN_OFFSET = 210 * 60_000;
const tehranDay = (ms: number) => Math.floor((ms + TEHRAN_OFFSET) / DAY);

/** Priority and days left of one job from its planned end: overdue → فوری, due today → امروز, later → عادی. */
export function technicianDue(plannedEndAt: string | null | undefined, now: Date = new Date()): TechnicianDue {
  const end = plannedEndAt ? Date.parse(plannedEndAt) : NaN;
  if (!Number.isFinite(end)) return { priority: 'normal', daysLeft: null, daysText: 'بدون مهلت' };
  const days = tehranDay(end) - tehranDay(now.getTime());
  if (end < now.getTime()) {
    const late = Math.max(0, -days);
    return { priority: 'urgent', daysLeft: late ? -late : 0, daysText: late ? `${toPersianDigits(late)} روز گذشته` : 'موعد گذشته' };
  }
  if (days <= 0) return { priority: 'today', daysLeft: 0, daysText: 'امروز' };
  return { priority: 'normal', daysLeft: days, daysText: `${toPersianDigits(days)} روز` };
}
