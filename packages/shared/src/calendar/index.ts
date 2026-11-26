import { parseJalali, TEHRAN_OFFSET_MINUTES, toJalaliParts } from '../jalali';
import { NIGHT_LIST_GRACE_MINUTES, NIGHT_LIST_LEAD_MINUTES } from '../night-list';
import { DEFAULT_WORK_CALENDAR, type WorkCalendarConfig } from './config';

export { default, DEFAULT_WORK_CALENDAR, IRAN_HOLIDAY_SEED } from './config';
export type { Shift, Week, WorkCalendarConfig } from './config';

/** UTC instant, or a Jalali calendar date string such as 1405-09-05. */
export type CalendarDate = Date | string;

const MINUTE = 60_000;
const DAY = 86_400_000;
const OFFSET = TEHRAN_OFFSET_MINUTES * MINUTE;
const pad = (value: number) => String(value).padStart(2, '0');

/** Converts a UTC instant to Tehran-local Jalali date and time parts. */
export function toJalali(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new RangeError('تاریخ نامعتبر است.');
  return toJalaliParts(date);
}

/** Converts a Jalali date and optional Tehran wall time to a UTC instant. */
export function fromJalali(date: string, time = '00:00'): Date {
  const result = parseJalali(date, time);
  if (!result) throw new RangeError('تاریخ یا ساعت جلالی نامعتبر است.');
  return result;
}

function dayNumber(date: CalendarDate): number {
  const instant = typeof date === 'string' ? fromJalali(date) : date;
  if (!Number.isFinite(instant.getTime())) throw new RangeError('تاریخ نامعتبر است.');
  return Math.floor((instant.getTime() + OFFSET) / DAY);
}

function dayStart(day: number): Date {
  return new Date(day * DAY - OFFSET);
}

function prepareCalendar(config: WorkCalendarConfig) {
  const holidays = new Set(config.holidays.map(dayNumber));
  const ramadan = config.ramadan && {
    start: dayNumber(config.ramadan.start),
    end: dayNumber(config.ramadan.end),
    week: config.ramadan.week,
  };
  if (ramadan && ramadan.end < ramadan.start) {
    throw new RangeError('پایان بازهٔ رمضان پیش از شروع آن است.');
  }
  return {
    lastPossibleDay: config.week.some((shifts) => shifts.length) ? Infinity : (ramadan?.end ?? -Infinity),
    shifts(day: number) {
      if (holidays.has(day)) return [];
      const week = ramadan && day >= ramadan.start && day <= ramadan.end ? ramadan.week : config.week;
      return week[new Date(day * DAY).getUTCDay()] ?? [];
    },
  };
}

export function isWorkingDay(date: CalendarDate, config = DEFAULT_WORK_CALENDAR): boolean {
  return prepareCalendar(config).shifts(dayNumber(date)).length > 0;
}

export function workingMinutes(date: CalendarDate, config = DEFAULT_WORK_CALENDAR): number {
  return prepareCalendar(config).shifts(dayNumber(date))
    .reduce((minutes, shift) => minutes + shift.end - shift.start, 0);
}

/**
 * Advances by n working days, excluding the starting day. Returns the target
 * day's Tehran midnight as a UTC instant. Zero returns the starting midnight.
 */
export function addWorkingDays(date: CalendarDate, n: number, config = DEFAULT_WORK_CALENDAR): Date {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('تعداد روزهای کاری باید عدد صحیح نامنفی باشد.');
  const start = dayNumber(date);
  if (n === 0) return dayStart(start);
  const calendar = prepareCalendar(config);
  for (let day = start + 1; day <= calendar.lastPossibleDay; day += 1) {
    if (!Number.isFinite(dayStart(day).getTime())) break;
    if (calendar.shifts(day).length && --n === 0) return dayStart(day);
  }
  throw new RangeError('تعداد روزهای کاری آینده کافی نیست.');
}

/** Counts working dates in (a, b], ignoring time of day. Reversed ranges are invalid. */
export function workingDaysBetween(a: CalendarDate, b: CalendarDate, config = DEFAULT_WORK_CALENDAR): number {
  const start = dayNumber(a);
  const end = dayNumber(b);
  if (end < start) throw new RangeError('پایان بازه پیش از شروع آن است.');
  const calendar = prepareCalendar(config);
  let count = 0;
  for (let day = start + 1; day <= end; day += 1) {
    if (calendar.shifts(day).length) count += 1;
  }
  return count;
}

const clockTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Tehran wall-clock times based on the final shift, or null on a closed day. */
export function nightListCutoff(date: CalendarDate, config = DEFAULT_WORK_CALENDAR):
  { build: string; approvalDeadline: string } | null {
  const shifts = prepareCalendar(config).shifts(dayNumber(date));
  if (!shifts.length) return null;
  const end = Math.max(...shifts.map((shift) => shift.end));
  return {
    build: clockTime(Math.max(0, end - NIGHT_LIST_LEAD_MINUTES)),
    approvalDeadline: clockTime(Math.min(1439, end + NIGHT_LIST_GRACE_MINUTES)),
  };
}
