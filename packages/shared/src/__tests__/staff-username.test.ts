import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayStaffUsername, expertUsernameForCode, normalizeStaffUsername, technicianUsernameForStation } from '../index';

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
