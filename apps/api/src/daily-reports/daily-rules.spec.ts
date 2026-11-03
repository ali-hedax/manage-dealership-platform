import { compareReportTimes, nextTehranDay, tehranAt, tehranDate } from './daily-time';
import { confirmedBase, emdadSuggestion } from './emdad.service';
import { safeCell } from './safe-cell';

describe('Tehran days of the daily reports', () => {
  it('switches the day at Tehran midnight and places 11:00 on the Tehran day', () => {
    expect(tehranDate(new Date('2026-12-01T20:29:59Z'))).toBe('2026-12-01');
    expect(tehranDate(new Date('2026-12-01T20:30:00Z'))).toBe('2026-12-02');
    expect(tehranAt('2026-12-02', '11:00').toISOString()).toBe('2026-12-02T07:30:00.000Z');
    expect(tehranAt('2026-12-02', '10:00').toISOString()).toBe('2026-12-02T06:30:00.000Z');
    expect(nextTehranDay('2026-12-01').toISOString()).toBe('2026-12-01T20:30:00.000Z');
  });

  it('treats a report known only by its day as equal to any report of that day', () => {
    const day = { at: tehranAt('2026-12-02', '00:00'), precision: 'day' };
    const nine = { at: tehranAt('2026-12-02', '09:00'), precision: 'minute' };
    const ten = { at: tehranAt('2026-12-02', '10:00'), precision: 'minute' };
    expect(compareReportTimes(day, nine)).toBe(0);
    expect(compareReportTimes(nine, ten)).toBe(-1);
    expect(compareReportTimes({ at: tehranAt('2026-12-01', '23:59'), precision: 'minute' }, day)).toBe(-1);
  });
});

describe('Emdad rules', () => {
  it('confirms a base code only when part, initial and full codes agree', () => {
    expect(confirmedBase({ partCode: '12345601', initialCode: '12345601', fullCodeBase: '12345601' })).toBe('12345601');
    expect(confirmedBase({ partCode: '12345601', initialCode: '', fullCodeBase: null })).toBe('12345601');
    expect(confirmedBase({ partCode: '12345601', initialCode: '12345699', fullCodeBase: null })).toBeNull();
    expect(confirmedBase({ partCode: '12345601', initialCode: '12345601', fullCodeBase: '99999999' })).toBeNull();
    expect(confirmedBase({ partCode: '', initialCode: '12345601', fullCodeBase: '12345601' })).toBeNull();
  });

  it('suggests a next step with its reason and never decides', () => {
    const base = { caseId: 'c', partRequestId: null, matchStatus: 'matched', official: {} };
    expect(emdadSuggestion({ ...base, statusCategory: 'in_dealer_stock' })).toContain('رسید فیزیکی');
    expect(emdadSuggestion({ ...base, statusCategory: 'in_supply', matchStatus: 'ambiguous' })).toContain('دستی');
    expect(emdadSuggestion({ ...base, statusCategory: 'needs_interpretation' })).toContain('معنای');
    expect(emdadSuggestion({ ...base, statusCategory: 'in_supply' })).toBeNull();
  });
});

describe('export cells', () => {
  it('neutralizes formula-like text but keeps codes and negative numbers', () => {
    expect(safeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeCell('+98')).toBe("'+98");
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(safeCell('-A1')).toBe("'-A1");
    expect(safeCell('-1')).toBe('-1');
    expect(safeCell('0012345601')).toBe('0012345601');
  });
});
