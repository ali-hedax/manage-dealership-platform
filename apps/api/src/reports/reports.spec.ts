import { allowedViews, periodRange, priorityOf, tehranDayStart } from './reports.service';

// 2026-11-01T21:00Z is 00:30 on 1405/08/11 (Monday) in Tehran.
const now = new Date('2026-11-01T21:00:00Z');

describe('report periods and priorities (Tehran days, Jalali calendar)', () => {
  it('starts "today" at Tehran midnight, not UTC midnight', () => {
    expect(tehranDayStart(now).toISOString()).toBe('2026-11-01T20:30:00.000Z');
    const r = periodRange({ period: 'today' }, now);
    expect(r.from.toISOString()).toBe('2026-11-01T20:30:00.000Z');
    expect(r.to).toBe(now);
    // Same length directly before: 30 minutes of the previous day, not a whole day.
    expect(r.previousFrom.toISOString()).toBe('2026-11-01T20:00:00.000Z');
    expect(r.previousTo.toISOString()).toBe('2026-11-01T20:30:00.000Z');
  });

  it('starts the week on Saturday and the month on the 1st of the Jalali month', () => {
    // Monday 1405/08/11 → week from Saturday 1405/08/09 00:00 Tehran.
    expect(periodRange({ period: 'week' }, now).from.toISOString()).toBe('2026-10-30T20:30:00.000Z');
    // 1405/08/01 00:00 Tehran = 2026-10-22T20:30Z.
    const month = periodRange({ period: 'month' }, now);
    expect(month.from.toISOString()).toBe('2026-10-22T20:30:00.000Z');
    // Incomplete month compared with the same elapsed length before it.
    expect(month.previousTo.getTime() - month.previousFrom.getTime()).toBe(now.getTime() - month.from.getTime());
  });

  it('takes custom Jalali days inclusively (Persian digits accepted) and rejects reversed ranges', () => {
    const r = periodRange({ period: 'custom', from: '۱۴۰۵/۰۸/۰۱', to: '1405/08/02' }, now);
    expect(r.from.toISOString()).toBe('2026-10-22T20:30:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-24T20:30:00.000Z');
    expect(() => periodRange({ period: 'custom', from: '1405/08/05', to: '1405/08/01' }, now)).toThrow();
    expect(() => periodRange({ period: 'custom' }, now)).toThrow();
  });

  it('orders by due time in Tehran days and treats a missing due date as "no due date", not late', () => {
    expect(priorityOf(null, now)).toEqual({ priority: 'none', reason: 'بدون موعد' });
    expect(priorityOf(new Date('2026-11-01T20:45:00Z'), now).priority).toBe('overdue');
    expect(priorityOf(new Date('2026-10-29T20:00:00Z'), now).reason).toBe('موعد 3 روز گذشته');
    // 23:00 Tehran the same day is "today"; 00:10 the next Tehran day is not.
    expect(priorityOf(new Date('2026-11-02T19:30:00Z'), now).priority).toBe('today');
    expect(priorityOf(new Date('2026-11-02T20:40:00Z'), now).priority).toBe('soon');
    expect(priorityOf(new Date('2026-11-10T20:40:00Z'), now).priority).toBe('later');
  });

  it('opens views by permission only', () => {
    expect(allowedViews(new Set(['report.manager', 'part.manage', 'case.update', 'task.manage']))).toEqual(['manager', 'parts', 'accident', 'workshop']);
    expect(allowedViews(new Set(['part.manage']))).toEqual(['parts']);
    expect(allowedViews(new Set(['qc.inspect']))).toEqual(['workshop']);
    expect(allowedViews(new Set(['case.read', 'finance.payment']))).toEqual([]);
  });
});
