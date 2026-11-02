import { writeWorkbook } from '../parts/xlsx';
import { buildVehicleWorkbook } from './sample';
import {
  idKey,
  isFullVin,
  isNonUniqueAdmission,
  normalizeCaseNumber,
  parseCoverage,
  parseSheetDate,
  parseSheetTime,
  parseStage,
  parseVehicleWorkbook,
  SheetError,
  toInstant,
} from './vehicle-sheet';

describe('vehicle intake sheet', () => {
  it('finds the vehicle list behind guide sheets and title rows, and reports blank template rows', () => {
    const file = buildVehicleWorkbook(
      [
        { 'شماره کارت پذیرش': '۰۰۷۱', 'شماره شاسی ثبت‌شده': 'ab 12-34', 'نام مالک': 'مالک آزمون' },
        { 'شماره کارت پذیرش': 'بدون پذیرش', خودرو: 'رانا' },
      ],
      3,
    );
    const sheet = parseVehicleWorkbook(file);
    expect(sheet.sheetName).toBe('لیست خودروها');
    expect(sheet.headerRow).toBe(3);
    expect(sheet.rows.map((r) => r.rowNo)).toEqual([4, 5]);
    expect(sheet.blankRows).toEqual([6, 7, 8]);
    expect(sheet.unmappedColumns).toEqual([]);
    const [first] = sheet.rows;
    expect(first!.get('admissionNo')).toBe('۰۰۷۱');
    // Provenance keeps the file's own header text and the original value.
    expect(first!.source['شماره شاسی ثبت‌شده']).toBe('ab 12-34');
  });

  it('rejects a workbook without the vehicle list columns', () => {
    const file = writeWorkbook([{ name: 'قطعات', rows: [['شرح قطعه', 'منبع'], ['سپر', 'شرکت']] }]);
    expect(() => parseVehicleWorkbook(file)).toThrow(SheetError);
  });

  it('normalizes identifiers for matching without losing leading zeros', () => {
    expect(idKey('۰۰۱۲ ۳')).toBe('00123');
    expect(idKey('٠٠٧١')).toBe('0071');
    expect(idKey('ab 12-34')).toBe('AB1234');
    expect(isNonUniqueAdmission('بدون پذیرش')).toBe(true);
    expect(isNonUniqueAdmission(' برگشتی ۸۸')).toBe(true);
    expect(isNonUniqueAdmission('۹۰۰۱۲')).toBe(false);
    // An 8-character chassis number is not a VIN; I/O/Q are not VIN letters.
    expect(isFullVin('NAAN01CE8KK123456')).toBe(true);
    expect(isFullVin('TST00001')).toBe(false);
    expect(isFullVin('NAAN01CE8KK12345O')).toBe(false);
    expect(normalizeCaseNumber(' ac-۱۴۰۵-۰۰۱۲ ')).toBe('AC-1405-0012');
  });

  it('reads Jalali text and Excel serial dates, and converts at the Tehran day boundary', () => {
    expect(parseSheetDate('۱۴۰۵/۰۸/۰۵')).toEqual({ jy: 1405, jm: 8, jd: 5 });
    expect(parseSheetDate('1405-8-5')).toEqual({ jy: 1405, jm: 8, jd: 5 });
    // 2026-10-27 as an Excel serial (days since 1899-12-30) is 1405/08/05.
    const serial = (Date.UTC(2026, 9, 27) - Date.UTC(1899, 11, 30)) / 86_400_000;
    expect(parseSheetDate(String(serial))).toEqual({ jy: 1405, jm: 8, jd: 5 });
    expect(parseSheetDate('۱۴۰۵/۱۳/۰۱')).toBe('invalid');
    expect(parseSheetDate('دیروز')).toBe('invalid');
    expect(parseSheetDate('')).toBeNull();
    // Midnight in Tehran (UTC+03:30) is 20:30 UTC of the previous day.
    expect(toInstant({ jy: 1405, jm: 8, jd: 5 }, '00:00').toISOString()).toBe('2026-10-26T20:30:00.000Z');
    expect(toInstant({ jy: 1405, jm: 8, jd: 5 }, '23:59').toISOString()).toBe('2026-10-27T20:29:00.000Z');
  });

  it('reads times, stages and coverage wording, and flags unknown wording', () => {
    expect(parseSheetTime('۸:۳۰')).toBe('08:30');
    expect(parseSheetTime('08:30:00')).toBe('08:30');
    expect(parseSheetTime('0.5')).toBe('12:00');
    expect(parseSheetTime('25:00')).toBe('invalid');
    expect(parseSheetTime('')).toBeNull();
    expect(parseStage('در حال تعمیر')).toBe('in_repair');
    expect(parseStage('انتظار مجوز')).toBe('awaiting_approval');
    expect(parseStage('در انتظار مجوز / تأیید')).toBe('awaiting_approval');
    expect(parseStage('صافکاری')).toBe('invalid');
    expect(parseCoverage('کارت طلایی / امداد خودرو')).toBe('golden_card');
    expect(parseCoverage('شخصی (مشتری)')).toBe('personal');
    expect(parseCoverage('بیمه بدنه')).toBe('insurance');
    expect(parseCoverage('فاقد کارت طلایی')).toBe('invalid');
    expect(parseCoverage('')).toBeNull();
  });
});
