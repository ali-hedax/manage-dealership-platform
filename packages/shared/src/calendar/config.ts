import { DEFAULT_WORK_CALENDAR as WORKSHOP_DEFAULT } from '../workshop';

export interface Shift {
  /** Minutes since Tehran midnight. Shifts are non-overlapping and within one day. */
  readonly start: number;
  readonly end: number;
}

/** Indexed like getUTCDay() on the Tehran wall clock: Sunday = 0, Saturday = 6. */
export type Week = readonly (readonly Shift[])[];

export interface WorkCalendarConfig {
  readonly week: Week;
  readonly holidays: readonly string[];
  readonly ramadan?: {
    /** Both Jalali dates are inclusive. Holidays still take precedence. */
    readonly start: string;
    readonly end: string;
    readonly week: Week;
  };
}

/**
 * Admin-editable seed for 1405 and 1406: fixed Solar Hijri public holidays only.
 * Add separately verified lunar and exceptional closures to the holiday list.
 * Reference: Iran's official 1405 calendar, Calendar Center, University of Tehran.
 * https://www.avazehgostar.com/file/pdf/calendar_1405
 */
export const IRAN_HOLIDAY_SEED = [1405, 1406].flatMap((year) =>
  [
    '01-01', '01-02', '01-03', '01-04', // Nowruz
    '01-12', '01-13', // Islamic Republic Day, Nature Day
    '03-14', '03-15', // Khomeini's death, 15 Khordad
    '11-22', // Revolution anniversary
    '12-29', // Oil nationalization
  ].map((day) => `${year}-${day}`),
);

export const DEFAULT_WORK_CALENDAR: WorkCalendarConfig = {
  week: WORKSHOP_DEFAULT.week.map((day) => day.map((shift) => ({ ...shift }))),
  holidays: IRAN_HOLIDAY_SEED,
};

export default DEFAULT_WORK_CALENDAR;
