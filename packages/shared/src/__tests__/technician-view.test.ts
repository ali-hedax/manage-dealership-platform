import assert from 'node:assert/strict';
import { test } from 'node:test';
import { technicianDue, TECHNICIAN_PRIORITY_LABELS } from '../index';

// Tehran = UTC+03:30. 2026-11-28 10:00 Tehran = 06:30Z.
const NOW = new Date('2026-11-28T06:30:00Z');

test('technician job: overdue is «فوری» with the days past, today is «امروز», later is «عادی» with days left', () => {
  assert.deepEqual(technicianDue('2026-11-26T14:30:00Z', NOW), { priority: 'urgent', daysLeft: -2, daysText: '۲ روز گذشته' });
  assert.deepEqual(technicianDue('2026-11-28T05:00:00Z', NOW), { priority: 'urgent', daysLeft: 0, daysText: 'موعد گذشته' });
  assert.deepEqual(technicianDue('2026-11-28T14:00:00Z', NOW), { priority: 'today', daysLeft: 0, daysText: 'امروز' });
  // 23:59 Tehran the same day is still «امروز»; 00:10 Tehran next day is one day.
  assert.equal(technicianDue('2026-11-28T20:29:00Z', NOW).priority, 'today');
  assert.deepEqual(technicianDue('2026-11-28T20:40:00Z', NOW), { priority: 'normal', daysLeft: 1, daysText: '۱ روز' });
  assert.deepEqual(technicianDue('2026-12-01T10:00:00Z', NOW), { priority: 'normal', daysLeft: 3, daysText: '۳ روز' });
});

test('technician job without a deadline is «عادی» and says so; labels are Persian', () => {
  assert.deepEqual(technicianDue(null, NOW), { priority: 'normal', daysLeft: null, daysText: 'بدون مهلت' });
  assert.deepEqual(technicianDue('not a date', NOW), { priority: 'normal', daysLeft: null, daysText: 'بدون مهلت' });
  assert.deepEqual(TECHNICIAN_PRIORITY_LABELS, { urgent: 'فوری', today: 'امروز', normal: 'عادی' });
});
