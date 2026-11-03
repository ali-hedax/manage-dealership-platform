import { TEHRAN_OFFSET_MINUTES } from '@manage/shared';

// Tehran calendar days for the daily reports and the 11:00 reminders. The day
// boundary is Tehran midnight (fixed +03:30, as in packages/shared/jalali.ts).

const OFFSET = TEHRAN_OFFSET_MINUTES * 60_000;

/** Gregorian YYYY-MM-DD of the Tehran day containing the instant. */
export function tehranDate(d: Date): string {
  return new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
}

/** UTC instant of HH:MM Tehran time on the given Tehran day. */
export function tehranAt(localDate: string, hhmm: string): Date {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, d, h, mi) - OFFSET);
}

export function nextTehranDay(localDate: string): Date {
  return new Date(tehranAt(localDate, '00:00').getTime() + 86_400_000);
}

/**
 * Orders two report times. A report known only by its day is equal to any
 * report of the same day (no midnight time is invented); otherwise the
 * earlier instant is older.
 */
export function compareReportTimes(a: { at: Date; precision: string }, b: { at: Date; precision: string }): number {
  const da = tehranDate(a.at);
  const db = tehranDate(b.at);
  if (da !== db) return da < db ? -1 : 1;
  if (a.precision === 'day' || b.precision === 'day') return 0;
  return Math.sign(a.at.getTime() - b.at.getTime());
}
