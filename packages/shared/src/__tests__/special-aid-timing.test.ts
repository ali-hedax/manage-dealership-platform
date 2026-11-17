import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WORK_CALENDAR, technicianTiming, wholeWorkingDays, workingDayMinutes } from '../workshop';
import { WORKFLOW_BLOCKER_CODES, blockersOf, canResolveBlocker, workflowBlocker } from '../workflow-blockers';
import { assessmentCodeOf, emdadNoKey, parseProcurementCode, partIdentifiers } from '../stock-code';

const day = workingDayMinutes(DEFAULT_WORK_CALENDAR); // 480 minutes on the default calendar

test('a fraction of a working day counts as zero; complete days only', () => {
  assert.equal(day, 480);
  assert.equal(wholeWorkingDays(479, day), 0);
  assert.equal(wholeWorkingDays(480, day), 1);
  assert.equal(wholeWorkingDays(959, day), 1);
  assert.equal(wholeWorkingDays(null, day), null);
});

test('technician time runs from the actual start of this assignment only; no start → not calculated', () => {
  // Saturday 08:00 → 14:00 Tehran = 300 working minutes (lunch excluded) of a 1-day plan.
  const t = technicianTiming({ actualStartAt: '2026-11-07T08:00:00+03:30', actualEndAt: '2026-11-07T14:00:00+03:30', plannedMinutes: 480, now: '2026-11-20T00:00:00Z', calendar: DEFAULT_WORK_CALENDAR });
  assert.deepEqual(t, { workMinutes: 300, plannedMinutes: 480, delayMinutes: 0, workDays: 0, delayDays: 0 });
  assert.deepEqual(technicianTiming({ actualStartAt: null, actualEndAt: null, plannedMinutes: 480, now: '2026-11-20T00:00:00Z', calendar: DEFAULT_WORK_CALENDAR }), { workMinutes: null, plannedMinutes: 480, delayMinutes: null, workDays: null, delayDays: null });
  // Active: until now. Two full working days beyond a half-day plan → 1 complete day of delay (1.5 days → 1).
  const active = technicianTiming({ actualStartAt: '2026-11-07T08:00:00+03:30', actualEndAt: null, plannedMinutes: 240, now: '2026-11-09T08:00:00+03:30', calendar: DEFAULT_WORK_CALENDAR });
  assert.equal(active.workMinutes, 960);
  assert.equal(active.workDays, 2);
  assert.equal(active.delayMinutes, 720);
  assert.equal(active.delayDays, 1);
});

test('blocker guidance: stable codes, Persian wording, target in the same case, resolvable only with permission', () => {
  const b = workflowBlocker('REPAIR_ROUTE_MISSING', 'case-1');
  assert.equal(b.message, 'برای شروع کار، مسیر تعمیر این خودرو باید مشخص شود.');
  assert.equal(b.actionLabel, 'تنظیم مسیر تعمیر');
  assert.deepEqual(b.target, { caseId: 'case-1', tab: 'plan', anchor: 'case-plan' });
  assert.equal(canResolveBlocker(b, (p) => p === 'task.manage'), true);
  assert.equal(canResolveBlocker(b, (p) => p === 'task.execute'), false);
  for (const code of WORKFLOW_BLOCKER_CODES) assert.match(workflowBlocker(code, 'c').role, /کارشناس تصادفات/);
  assert.deepEqual(blockersOf({ blockers: [b, { nope: true }] }), [b]);
  assert.deepEqual(blockersOf(undefined), []);
});

test('identifiers stay text with leading zeros', () => {
  assert.equal(assessmentCodeOf('0012345602'), '00123456');
  assert.equal(parseProcurementCode('0012345602'), '0012345602');
  assert.equal(emdadNoKey('0070001'), '0070001');
  assert.deepEqual(partIdentifiers({ partNumber: '00123456', procurementCode: '0012345601', source: 'company' }).displayCode, '0012345601');
});
