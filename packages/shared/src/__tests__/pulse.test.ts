import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHANGE_NOTES, kasbCredentialText, moduleStatuses, permissionsFor, PERMISSION_GROUPS, PERMISSION_LABELS, PERMISSIONS, PIN_DENIED_PERMISSIONS, pulseCaptchaSchema, pulseCommandSchema, pulseCredentialsSchema,
  pulseSentence, pulseSettingsSchema, receptionExternalWorkSchema, receptionSearchSchema,
} from '../index';

test('Manage Pulse permissions: owner and system administrator; the accident expert also reads receptions', () => {
  for (const p of ['integration.manage', 'reception.read', 'reception.external_work'] as const) {
    assert.equal(PERMISSIONS.includes(p), true, p);
    assert.equal(typeof PERMISSION_LABELS[p], 'string');
    assert.equal(PERMISSION_GROUPS.some((g) => g.permissions.includes(p)), true, p);
    assert.equal(permissionsFor(['system_admin']).has(p), true);
    assert.equal(permissionsFor([], {}, null, true).has(p), true);
    // Owner decision 2026-11-27: reception.read (receptions and the night list) is in the accident expert's default.
    const without = ['accident_expert', 'parts_clerk', 'service_manager', 'technician', 'special_aid_operator', 'special_aid_supply', 'guest'].filter((r) => !(p === 'reception.read' && r === 'accident_expert'));
    for (const role of without) assert.equal(permissionsFor([role]).has(p), false, `${role} ${p}`);
  }
  assert.equal(permissionsFor(['accident_expert']).has('reception.read'), true);
  assert.equal(permissionsFor(['accident_expert']).has('special_aid.read'), false);
  // Read only for a PIN session too; settings and the connection stay out of PIN sessions.
  assert.equal(PIN_DENIED_PERMISSIONS.includes('reception.read'), false);
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
  assert.equal(CHANGE_NOTES.some((n) => n.key === 'manage-pulse'), true);
  assert.equal(new Set(CHANGE_NOTES.map((n) => n.key)).size, CHANGE_NOTES.length);
});

test('credentials typed on a Persian keyboard reach کسب‌وکار with Latin digits', () => {
  const v = pulseCredentialsSchema.parse({ expectedVersion: 0, dealerCode: ' ۴۰۰ ۱۳۰۷‏', username: '‎۰۳۸۳۹۴۸۷۲۱ ', password: 'Ab۱۲۳' });
  assert.equal(v.dealerCode, '4001307');
  assert.equal(v.username, '0383948721');
  assert.equal(v.password, 'Ab123');
  assert.equal(kasbCredentialText('٠١٢'), '012');
  assert.equal(pulseCredentialsSchema.safeParse({ expectedVersion: 0, dealerCode: '‏', username: 'x' }).success, false);
});
