import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayStaffUsername, expertUsernameForCode, hasStaffCode, normalizeStaffUsername, staffUsernameForCode, technicianUsernameForStation } from '../index';

test('station code determines TECH; selected two-digit code determines EXP', () => {
  assert.equal(technicianUsernameForStation('۰۳'), 'tech03');
  assert.equal(technicianUsernameForStation('02'), 'tech02');
  assert.equal(expertUsernameForCode('۰۰'), 'exp00');
  assert.equal(expertUsernameForCode('20'), 'exp20');
  assert.throws(() => expertUsernameForCode('2'));
  assert.throws(() => expertUsernameForCode('200'));
  assert.equal(displayStaffUsername('tech03'), 'TECH 03');
  assert.equal(normalizeStaffUsername(' EXP ۰۰ '), 'exp00');
  assert.equal(normalizeStaffUsername('X30-0'), 'x30-0');
  assert.equal(normalizeStaffUsername('legacy.name'), 'legacy.name');
});

test('MGR for the service manager, GST for a guest, EXP for everyone else (spec 29)', () => {
  assert.equal(staffUsernameForCode(['service_manager'], '۰۱'), 'mgr01');
  assert.equal(staffUsernameForCode(['guest'], '05'), 'gst05');
  assert.equal(staffUsernameForCode(['accident_expert'], '20'), 'exp20');
  assert.equal(staffUsernameForCode(['parts_clerk', 'special_aid_operator'], '21'), 'exp21');
  assert.throws(() => staffUsernameForCode(['guest'], '5'));
  assert.equal(normalizeStaffUsername(' MGR ۰۱ '), 'mgr01');
  assert.equal(normalizeStaffUsername('gst 05'), 'gst05');
  assert.equal(displayStaffUsername('mgr01'), 'MGR 01');
  assert.equal(displayStaffUsername('gst05'), 'GST 05');
  // Existing EXP usernames keep working; nothing is renamed automatically.
  assert.equal(hasStaffCode('exp20'), true);
  assert.equal(hasStaffCode('mgr01'), true);
  assert.equal(hasStaffCode('tech03'), false);
});
