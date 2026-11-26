import assert from 'node:assert/strict';
import test from 'node:test';
import calendar, {
  addWorkingDays, fromJalali, isWorkingDay, nightListCutoff, toJalali,
  workingDaysBetween, workingMinutes, type WorkCalendarConfig,
} from '../calendar';

test('Thursday is a half day and Saturday follows the split shift', () => {
  assert.equal(isWorkingDay('1405-09-05'), true);
  assert.equal(workingMinutes('1405-09-05'), 300);
  assert.deepEqual(nightListCutoff('1405-09-05'), { build: '12:30', approvalDeadline: '13:15' });
  assert.equal(workingMinutes('1405-09-07'), 480);
  assert.deepEqual(nightListCutoff('1405-09-07'), { build: '18:00', approvalDeadline: '18:45' });
});

test('Friday and seeded holidays in both years are closed', () => {
  for (const date of ['1405-09-06', '۱۴۰۵/۰۱/۱۳', '1406-01-13']) {
    assert.equal(isWorkingDay(date), false);
    assert.equal(workingMinutes(date), 0);
    assert.equal(nightListCutoff(date), null);
  }
});

test('working-day arithmetic crosses month and year boundaries including Nowruz', () => {
  assert.deepEqual(addWorkingDays('1405-08-30', 1), fromJalali('1405-09-01'));
  assert.deepEqual(addWorkingDays('1405-12-27', 1), fromJalali('1406-01-05'));
  assert.equal(workingDaysBetween('1405-12-27', '1406-01-05'), 1);
  assert.equal(workingDaysBetween('1406-01-05', '1406-01-05'), 0);
});

test('Special Assist reaches its yellow, red and deadline markers on working days 11, 18 and 20', () => {
  const start = fromJalali('1405-09-05', '15:30');
  const markers = [
    [11, '2026-12-09'],
    [18, '2026-12-17'],
    [20, '2026-12-20'],
  ] as const;
  for (const [day, gregorian] of markers) {
    const result = addWorkingDays(start, day);
    assert.equal(result.getTime(), Date.parse(`${gregorian}T00:00:00+03:30`));
    assert.equal(workingDaysBetween(start, result), day);
  }
});

test('Tehran keeps UTC+03:30 in winter and summer and switches dates at local midnight', () => {
  for (const [jalali, gregorian] of [['1405-09-05', '2026-11-26'], ['1405-05-01', '2026-07-23']] as const) {
    const instant = fromJalali(jalali, '08:00');
    assert.equal(instant.toISOString(), `${gregorian}T04:30:00.000Z`);
    const [jy, jm, jd] = jalali.split('-').map(Number);
    assert.deepEqual(toJalali(instant), { jy, jm, jd, hour: 8, minute: 0 });
  }
  assert.equal(workingMinutes(new Date('2026-11-26T20:29:59Z')), 300);
  assert.equal(workingMinutes(new Date('2026-11-26T20:30:00Z')), 0);
});

test('Ramadan overrides the week at both endpoints and an admin holiday wins', () => {
  const config: WorkCalendarConfig = {
    ...calendar,
    holidays: ['1405-09-08'],
    ramadan: {
      start: '1405-09-07',
      end: '1405-09-09',
      week: calendar.week.map((day) => day.length ? [{ start: 540, end: 840 }] : []),
    },
  };
  assert.equal(workingMinutes('1405-09-07', config), 300);
  assert.equal(workingMinutes('1405-09-08', config), 0);
  assert.deepEqual(nightListCutoff('1405-09-09', config), { build: '13:30', approvalDeadline: '14:15' });
  assert.equal(workingMinutes('1405-09-10', config), 480);
  assert.deepEqual(addWorkingDays('1405-09-07', 1, config), fromJalali('1405-09-09'));
});

test('zero days returns Tehran midnight and invalid inputs fail explicitly', () => {
  assert.deepEqual(addWorkingDays(fromJalali('1405-09-06', '08:00'), 0), fromJalali('1405-09-06'));
  assert.throws(() => fromJalali('1405-12-30'), RangeError);
  assert.throws(() => addWorkingDays('1405-09-05', -1), RangeError);
  assert.throws(() => workingDaysBetween('1405-09-07', '1405-09-05'), RangeError);
  assert.throws(() => addWorkingDays('1405-09-05', 1, { holidays: [], week: [] }), RangeError);
});
