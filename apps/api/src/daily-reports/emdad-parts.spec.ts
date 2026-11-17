import { assessmentCodeOf, emdadNoKey, normalizeTechnicalCode, parseProcurementCode, partIdentifiers, specialAidCodeProblem } from '@manage/shared';
import { decideEmdadLine, parseReportDate, reportQuantity, type EmdadLine } from './emdad-parts';
import { EMDAD_FIELDS, parseEmdadSheet } from './report-rows';
import { EMDAD_HEADERS, emdadRow } from './fixtures';

// Synthetic identifiers only (TESTVIN…, invented codes and numbers).
const VIN = 'TESTVIN0000000001';
const line = (id: string, over: Partial<EmdadLine> = {}): EmdadLine => ({
  id, caseId: 'case-1', caseNumber: 'AC-1', partNumber: null, procurementCode: null, emdadNo: null, vin: VIN, chassisRef: null, admissionKey: '9001', ...over,
});
const report = (code: string, over: Record<string, string> = {}) => ({ partCode: code, initialCode: code, fullCodeBase: code.slice(0, 8), fullCode: '', chassis: VIN, emdadNo: '', ...over });

describe('identifiers are text: 8-digit assessment code vs 10-digit procurement code', () => {
  it('keeps leading zeros and separates the manufacturer suffix', () => {
    expect(assessmentCodeOf('0012345601')).toBe('00123456');
    expect(assessmentCodeOf('00123456')).toBe('00123456');
    expect(parseProcurementCode('۰۰۱۲۳۴۵۶۰۲')).toBe('0012345602');
    expect(parseProcurementCode('00123456')).toBeNull();
    expect(emdadNoKey(' 0070041 ')).toBe('0070041');
  });

  it('shows the full procurement code of a special-aid line and keeps the assessment code in the details', () => {
    expect(partIdentifiers({ partNumber: '00123456', procurementCode: '0012345602', source: 'company' })).toEqual({ assessmentCode: '00123456', procurementCode: '0012345602', displayCode: '0012345602' });
    expect(partIdentifiers({ partNumber: '00123456', procurementCode: null, source: 'company' })).toEqual({ assessmentCode: '00123456', procurementCode: null, displayCode: '00123456' });
  });

  it('preserves complete market codes with letters and more than ten characters', () => {
    expect(normalizeTechnicalCode(' ab-12 34567890x ')).toBe('AB1234567890X');
    expect(partIdentifiers({ partNumber: 'AB1234567890X', source: 'external' })).toEqual({ assessmentCode: null, procurementCode: null, displayCode: 'AB1234567890X' });
  });

  it('validates a special-aid registration by field', () => {
    expect(specialAidCodeProblem('00123456', '0012345602')).toBeNull();
    expect(specialAidCodeProblem('00123456', '9912345602')).toContain('۸ رقم اول');
    expect(specialAidCodeProblem('00123456', '001234560')).toContain('۱۰ رقم');
    // An older line with another code shape can still be registered; only the typed procurement code is checked.
    expect(specialAidCodeProblem('123456', null)).toBeNull();
    expect(specialAidCodeProblem('AB1234567890X', null)).toBeNull();
  });
});

describe('report row → part line', () => {
  it('links by the special-aid number when chassis and assessment code agree', () => {
    const d = decideEmdadLine(report('00123456', { emdadNo: '0070041' }), '9001', [line('p1', { partNumber: '00123456', emdadNo: '0070041' }), line('p2', { partNumber: '00123456' })]);
    expect(d).toMatchObject({ kind: 'link', line: { id: 'p1' }, note: 'شمارهٔ امداد ویژه، شاسی و کد اختصاصی یکسان است' });
  });

  it('links an unnumbered line by VIN + 8-digit assessment code (the report fills the number later)', () => {
    expect(decideEmdadLine(report('00123456', { emdadNo: '0070041' }), '9001', [line('p1', { partNumber: '00123456' })])).toMatchObject({ kind: 'link', line: { id: 'p1' }, note: 'شاسی و کد اختصاصی یکسان است' });
  });

  it('never uses a legacy request number, and never links a recorded different special-aid number', () => {
    // The line carries only a legacy request number (not modelled on EmdadLine at all) → matched by VIN + code.
    expect(decideEmdadLine(report('00123456', { emdadNo: '7001' }), '9001', [line('p1', { partNumber: '00123456', emdadNo: '7999' })])).toMatchObject({ kind: 'review' });
  });

  it('two manufacturer variants share the 8-digit base: a different recorded procurement code is a conflict', () => {
    const lines = [line('p1', { partNumber: '00123456', procurementCode: '0012345601' })];
    expect(decideEmdadLine(report('00123456', { fullCode: '0012345602' }), '9001', lines)).toMatchObject({ kind: 'review', note: expect.stringContaining('کد تدارکاتی') });
    expect(decideEmdadLine(report('00123456', { fullCode: '0012345601' }), '9001', lines)).toMatchObject({ kind: 'link' });
    // Unknown variant on the line: the report's code is accepted for that base.
    expect(decideEmdadLine(report('00123456', { fullCode: '0012345602' }), '9001', [line('p1', { partNumber: '00123456' })])).toMatchObject({ kind: 'link' });
  });

  it('tells two open cases of the same VIN apart by the verified admission number, else sends it to review', () => {
    const lines = [line('p1', { partNumber: '00123456', caseId: 'case-1', admissionKey: '9001' }), line('p2', { partNumber: '00123456', caseId: 'case-2', admissionKey: '9002' })];
    expect(decideEmdadLine(report('00123456'), '9002', lines)).toMatchObject({ kind: 'link', line: { id: 'p2' } });
    expect(decideEmdadLine(report('00123456'), null, lines)).toMatchObject({ kind: 'review', ambiguous: true });
    expect(decideEmdadLine(report('00123456'), '9999', lines)).toMatchObject({ kind: 'review' });
  });

  it('two lines with the same code on one vehicle, or contradicting report codes, go to review', () => {
    expect(decideEmdadLine(report('00123456'), '9001', [line('p1', { partNumber: '00123456' }), line('p2', { partNumber: '0012345601' })])).toMatchObject({ kind: 'review', ambiguous: true });
    expect(decideEmdadLine({ ...report('00123456'), initialCode: '99999999' }, '9001', [line('p1', { partNumber: '00123456' })])).toMatchObject({ kind: 'review', note: expect.stringContaining('متناقض') });
  });

  it('a shared code on another vehicle is not enough', () => {
    expect(decideEmdadLine(report('00123456'), '9001', [line('p1', { partNumber: '00123456', vin: 'TESTVIN0000000002' })])).toEqual({ kind: 'none' });
  });
});

describe('report columns', () => {
  it('finds the verified special-aid number and warehouse receipt columns by name', () => {
    const grid = [[...EMDAD_HEADERS], EMDAD_HEADERS.map((h) => emdadRow(1, { 'تاريخ رسيد شدن امداد ويژه در انبار': '1405/08/20 10:30' })[h] ?? '')];
    const parsed = parseEmdadSheet(grid);
    expect(parsed.mappingIssues).toEqual([]);
    expect(parsed.rows[0]!.data).toMatchObject({ emdadNo: '700001', receivedInWarehouseAt: '1405/08/20 10:30' });
  });

  it('reads a report without the legacy request column and shows a missing critical column', () => {
    const headers = EMDAD_HEADERS.filter((h) => h !== 'شماره درخواست' && h !== 'تاريخ رسيد شدن امداد ويژه در انبار');
    const grid = [[...headers], headers.map((h) => emdadRow(2)[h] ?? '')];
    const parsed = parseEmdadSheet(grid);
    expect(parsed.rows[0]!.key).not.toBeNull();
    expect(parsed.mappingIssues.map((m) => m.header)).toEqual([EMDAD_FIELDS.receivedInWarehouseAt]);
    expect(parsed.mappingIssues[0]!.message).toContain('نمونهٔ بی‌نام');
  });

  it('parses the Jalali receipt date with or without time, and the confirmed quantity', () => {
    expect(parseReportDate('1405/08/20')?.toISOString()).toBe('2026-11-10T20:30:00.000Z');
    expect(parseReportDate('۱۴۰۵/۰۸/۲۰ ۱۰:۳۰')?.toISOString()).toBe('2026-11-11T07:00:00.000Z');
    expect(parseReportDate('')).toBeNull();
  });

  it('reads the received quantity only from the owner-verified column, never from another column or the line', () => {
    // No verified column: nothing counts as received, even when the cells are filled.
    expect(reportQuantity({ supplyQuantity: '2', specialQuantity: '2' }, null)).toBeNull();
    expect(reportQuantity({ supplyQuantity: '2', specialQuantity: '' }, 'supplyQuantity')).toBe(2);
    // The other column is never a fallback.
    expect(reportQuantity({ supplyQuantity: '', specialQuantity: '1.00' }, 'supplyQuantity')).toBeNull();
    expect(reportQuantity({ supplyQuantity: '', specialQuantity: '1.00' }, 'specialQuantity')).toBe(1);
    expect(reportQuantity({ supplyQuantity: '0', specialQuantity: '' }, 'supplyQuantity')).toBeNull();
    expect(reportQuantity({ supplyQuantity: '1.5', specialQuantity: '' }, 'supplyQuantity')).toBeNull();
  });
});
