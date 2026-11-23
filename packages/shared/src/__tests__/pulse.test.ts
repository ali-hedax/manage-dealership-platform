import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHANGE_NOTES, moduleStatuses, permissionsFor, PERMISSION_GROUPS, PERMISSION_LABELS, PERMISSIONS, PIN_DENIED_PERMISSIONS, pulseCaptchaSchema, pulseCommandSchema, pulseCredentialsSchema,
  pulseSentence, pulseSettingsSchema, receptionExternalWorkSchema, receptionSearchSchema,
} from '../index';

test('Manage Pulse permissions: owner and system administrator only, never in a PIN session', () => {
  for (const p of ['integration.manage', 'reception.read', 'reception.external_work'] as const) {
    assert.equal(PERMISSIONS.includes(p), true, p);
    assert.equal(typeof PERMISSION_LABELS[p], 'string');
    assert.equal(PERMISSION_GROUPS.some((g) => g.permissions.includes(p)), true, p);
    assert.equal(permissionsFor(['system_admin']).has(p), true);
    assert.equal(permissionsFor([], {}, null, true).has(p), true);
    for (const role of ['accident_expert', 'parts_clerk', 'service_manager', 'technician', 'special_aid_operator', 'special_aid_supply', 'guest']) assert.equal(permissionsFor([role]).has(p), false, `${role} ${p}`);
  }
  assert.equal(PIN_DENIED_PERMISSIONS.includes('integration.manage'), true);
});

test('the reception module is active only behind PULSE_ENABLED', () => {
  assert.equal(moduleStatuses({}).find((m) => m.key === 'reception')!.status, 'planned');
  assert.equal(moduleStatuses({ PULSE_ENABLED: false }).find((m) => m.key === 'reception')!.status, 'planned');
  assert.equal(moduleStatuses({ PULSE_ENABLED: true }).find((m) => m.key === 'reception')!.status, 'active');
  assert.equal(moduleStatuses({ PULSE_ENABLED: true }).find((m) => m.key === 'accident')!.status, 'active');
  assert.equal(moduleStatuses({ PULSE_ENABLED: true }).find((m) => m.key === 'warranty')!.status, 'planned');
});

test('status sentence of the settings card and the support desk', () => {
  const now = new Date('2026-11-23T08:00:00Z');
  const base = { configured: true, enabled: true, state: 'active' as const, lastReadAt: '2026-11-23T07:58:00Z', todayReceptions: 35, todayChanges: 8 };
  assert.equal(pulseSentence(base, now), 'پالس فعال است · آخرین خواندن ۲ دقیقه پیش · امروز ۳۵ پذیرش، ۸ تغییر');
  assert.equal(pulseSentence({ ...base, enabled: false }, now), 'پالس خاموش است · آخرین خواندن ۲ دقیقه پیش');
  assert.equal(pulseSentence({ ...base, state: 'captcha' }, now), 'پالس متوقف شد: در انتظار کد امنیتی · آخرین خواندن ۲ دقیقه پیش');
  assert.equal(pulseSentence({ ...base, configured: false }, now).startsWith('پالس هنوز تنظیم نشده است'), true);
  assert.equal(pulseSentence({ ...base, lastReadAt: null }, now).includes('هنوز خوانده نشده'), true);
});

test('settings, credentials and commands are validated', () => {
  assert.equal(pulseSettingsSchema.safeParse({ expectedVersion: 1, intervalMinutes: 2, hoursMode: 'calendar', hoursFrom: '07:00', hoursTo: '19:00', openWindowDays: 60 }).success, true);
  assert.equal(pulseSettingsSchema.safeParse({ expectedVersion: 1, intervalMinutes: 1, hoursMode: 'calendar', hoursFrom: '07:00', hoursTo: '19:00', openWindowDays: 60 }).success, false);
  assert.equal(pulseSettingsSchema.safeParse({ expectedVersion: 1, intervalMinutes: 3, hoursMode: 'custom', hoursFrom: '19:00', hoursTo: '07:00', openWindowDays: 60 }).success, false);
  assert.equal(pulseCredentialsSchema.safeParse({ expectedVersion: 0, dealerCode: '1307', username: 'u' }).success, true);
  assert.equal(pulseCredentialsSchema.safeParse({ expectedVersion: 0, dealerCode: '1307', username: 'u', token: 'x' }).success, false);
  assert.equal(pulseCommandSchema.safeParse({ kind: 'backfill', from: '1405/07/01' }).success, true);
  assert.equal(pulseCommandSchema.safeParse({ kind: 'captcha_answer' }).success, false);
  assert.equal(pulseCaptchaSchema.safeParse({ answer: '۴۸۲۱' }).success, true);
  assert.equal(pulseCaptchaSchema.safeParse({ answer: 'abcd' }).success, false);
  assert.equal(receptionSearchSchema.parse({ view: 'open' }).pageSize, 30);
  assert.equal(receptionExternalWorkSchema.safeParse({ description: 'تراشکاری', sentAt: '2026-11-23T08:00:00.000Z' }).success, false);
  assert.equal(receptionExternalWorkSchema.safeParse({ contractorName: 'تراشکار', description: 'تراشکاری', sentAt: '2026-11-23T08:00:00.000Z' }).success, true);
});

test('the release carries one Persian change note for Manage Pulse', () => {
  assert.equal(CHANGE_NOTES[0]!.key, 'manage-pulse');
  assert.equal(new Set(CHANGE_NOTES.map((n) => n.key)).size, CHANGE_NOTES.length);
});
