import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  integerText, normalizeSourceText, parseStoppageGrid, permissionsFor, PERMISSION_GROUPS, PERMISSION_LABELS, STOPPAGE_COLUMNS, STOPPAGE_FIELDS,
  stoppageItemActive, stoppageItemStage, stoppageReasonKind, stoppageStage, stoppageStartedAt,
} from '../index';

// Synthetic rows in the layout of «گزارش توقف خودرو» (22 columns). Arabic ي/ك as the export writes them.
const header = STOPPAGE_FIELDS.map((f) => STOPPAGE_COLUMNS[f]);
const row = (o: Partial<Record<(typeof STOPPAGE_FIELDS)[number], string>>) => STOPPAGE_FIELDS.map((f) => o[f] ?? '');
const base = { noticeNo: '900001', chassis: 'tst00001', cardStatus: 'كارت باز', ownerName: 'مالک ساختگی', ownerPhone: '09000000001', vehicleType: '3220901 تارا V1P با موتور TU5P', stopDate: '1405/09/02', stopTime: '13:30', createdDate: '1405/09/02', officeDate: '1405/09/02' };

test('normalizes Arabic yeh and kaf, digits and spaces of every value', () => {
  assert.equal(normalizeSourceText(' دريافت  مجوز گارانتي ازدفتر '), 'دریافت مجوز گارانتی ازدفتر');
  assert.equal(normalizeSourceText('كارت بسته'), 'کارت بسته');
  assert.equal(normalizeSourceText('۱۴۰۵/۰۹/۰۲'), '1405/09/02');
});

test('integer cells come back as plain digits; codes are never padded or trimmed', () => {
  assert.equal(integerText('949661'), '949661');
  assert.equal(integerText('949661.0'), '949661');
  assert.equal(integerText('1.40500859343E11'), '140500859343');
  assert.equal(integerText('12.5'), '12.5');
  const parsed = parseStoppageGrid([header, row({ ...base, partCode: '07203037', referenceNo: '1564997' }), row({ ...base, partCode: '7203037', referenceNo: '1564998' })], 'توقف خودرو');
  assert.equal(parsed.rows[0]!.official.partCode, '07203037');
  assert.equal(parsed.rows[1]!.official.partCode, '7203037');
  assert.match(parsed.rows[1]!.notes.join(), /صفرهای ابتدای/);
  assert.equal(parsed.rows[0]!.official.chassis, 'TST00001');
  assert.equal(parsed.rows[0]!.official.cardStatus, 'کارت باز');
});

test('a file with changed columns is blocked; a repeated header and empty rows are skipped; duplicates are errors', () => {
  const blocked = parseStoppageGrid([header.slice(0, 21), row(base)], 'توقف خودرو');
  assert.match(blocked.headerProblem!, /تاریخ رد/);
  assert.equal(blocked.rows.length, 0);
  const data = row({ ...base, reason: 'امدادويژه', partCode: '15922002', referenceNo: '140500000001', status: 'ارسال به ستاد' });
  const parsed = parseStoppageGrid([[], header, data, header, [], data, row({ ...base, noticeNo: '', chassis: 'X' })], 'Sheet1');
  assert.equal(parsed.headerProblem, null);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.errors.map((e) => e.row), [6, 7]);
  assert.match(parsed.warnings[0]!, /توقف خودرو/);
  assert.equal(parsed.rows[0]!.key, '900001|140500000001|15922002');
});

test('unknown stoppage status is kept and flagged; empty status is flagged', () => {
  const parsed = parseStoppageGrid([header, row({ ...base, referenceNo: '1', status: 'در انتظار' }), row({ ...base, referenceNo: '2' })], null);
  assert.equal(parsed.rows[0]!.official.status, 'در انتظار');
  assert.match(parsed.rows[0]!.notes.join(), /ناشناخته/);
  assert.match(parsed.rows[1]!.notes.join(), /خالی/);
});

test('reason kinds, item stages and the stage of the whole stoppage', () => {
  assert.equal(stoppageReasonKind('امدادویژه'), 'special_aid');
  assert.equal(stoppageReasonKind('دریافت مجوز گارانتی ازستاد'), 'permit_hq');
  assert.equal(stoppageReasonKind('دريافت مجوز گارانتي ازدفتر'), 'permit_office');
  assert.equal(stoppageReasonKind('علت تازه'), 'other');
  const o = { status: 'ارسال به ستاد', officeDate: '1405/09/02', hqDate: '1405/09/02', endDate: '', rejectDate: '' };
  assert.equal(stoppageItemStage(o), 'sent_hq');
  assert.equal(stoppageItemStage(o, true), 'part_arrived');
  assert.equal(stoppageItemStage({ ...o, hqDate: '' }), 'sent_office');
  assert.equal(stoppageItemStage({ ...o, status: 'خاتمه', endDate: '1405/09/03' }), 'ended');
  assert.equal(stoppageItemStage({ ...o, rejectDate: '1405/09/03' }), 'rejected');
  assert.equal(stoppageItemActive({ status: 'خاتمه' }), false);
  assert.equal(stoppageItemActive({ status: 'نامعلوم' }), true);
  assert.equal(stoppageStage([{ stage: 'ended', active: false }, { stage: 'sent_hq', active: true }, { stage: 'part_arrived', active: true }]), 'sent_hq');
  assert.equal(stoppageStage([{ stage: 'ended', active: false }]), 'ended');
  assert.equal(stoppageStage([{ stage: 'rejected', active: false }]), 'rejected');
});

test('stop instant is the earliest stop date and time in Tehran', () => {
  const at = stoppageStartedAt([{ stopDate: '1405/09/02', stopTime: '13:31', createdDate: '' }, { stopDate: '1405/09/02', stopTime: '13:30', createdDate: '' }]);
  assert.equal(at!.toISOString(), '2026-11-23T10:00:00.000Z');
  assert.equal(stoppageStartedAt([{ stopDate: '', stopTime: '', createdDate: '' }]), null);
});

test('stoppage permissions are labelled, grouped and never given to a guest or technician', () => {
  for (const p of ['stoppage.read', 'stoppage.import', 'stoppage.manage'] as const) {
    assert.equal(typeof PERMISSION_LABELS[p], 'string');
    assert.equal(PERMISSION_GROUPS.some((g) => g.permissions.includes(p)), true);
    assert.equal(permissionsFor(['guest']).has(p), false);
    assert.equal(permissionsFor(['technician']).has(p), false);
  }
  assert.equal(permissionsFor(['service_manager']).has('stoppage.read'), true);
  assert.equal(permissionsFor(['service_manager']).has('stoppage.manage'), false);
  assert.equal(permissionsFor(['parts_clerk']).has('stoppage.import'), true);
});
