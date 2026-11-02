import { writeWorkbook } from '../parts/xlsx';
import { VEHICLE_SHEET_NAME } from './vehicle-sheet';

// Synthetic workbook with the same layout as the dealership's intake sheet
// (two title rows, header on row 3, guide sheets before/after). Used by the
// downloadable sample and by tests. No real customer data.

export const SHEET_HEADERS = [
  'ردیف',
  'شماره کارت پذیرش',
  'تاریخ پذیرش',
  'شماره شاسی ثبت‌شده',
  'خودرو',
  'نام مالک',
  'پلاک (تکمیل شود)',
  'پوشش مندرج در لیست',
  'توضیحات فعلی — عین برگه',
  'وضعیت فعلی تعمیر',
  'اقدام بعدی',
  'وضعیت قطعات',
  'قطعه معطل‌کننده (در صورت وجود)',
  'مسئول پیگیری',
  'واحد درگیر',
  'موعد تحویل',
  'مانع اصلی',
  'وضعیت تأیید/مجوز',
  'وضعیت مالی',
  'آخرین پیگیری',
  'توضیح تکمیلی',
  'کنترل اطلاعات',
  'نوع پوشش تأییدشده',
  'شماره پرونده Manage',
  'VIN کامل (در صورت تأیید)',
  'کنترل تکرار (خودکار)',
  'ساعت پذیرش (اگر معلوم است)',
  'ساعت موعد تحویل (اگر معلوم است)',
] as const;
export type SheetHeader = (typeof SHEET_HEADERS)[number];
export type SheetRow = Partial<Record<SheetHeader, string>>;

/** Workbook with the intake layout; `blankTemplateRows` adds rows that only carry a row number. */
export function buildVehicleWorkbook(rows: SheetRow[], blankTemplateRows = 0): Uint8Array {
  const data = rows.map((r, i) => SHEET_HEADERS.map((h) => (h === 'ردیف' ? (r[h] ?? String(i + 1)) : (r[h] ?? ''))));
  for (let i = 0; i < blankTemplateRows; i++) data.push(SHEET_HEADERS.map((h) => (h === 'ردیف' ? String(rows.length + i + 1) : '')));
  return writeWorkbook([
    { name: 'راهنما', rows: [['راهنمای تکمیل فایل (نمونه)'], ['این برگه خودرو نیست و نباید وارد شود.']] },
    {
      name: VEHICLE_SHEET_NAME,
      rows: [
        ['نمایندگی نمونه (داده ساختگی)', '', '', '', 'Manage by HEDAX'],
        [`فهرست ${rows.length} خودروی نمونه`, '', '', '', 'موارد نامعلوم خالی بماند؛ هر خودرو فقط یک ردیف.'],
        [...SHEET_HEADERS],
        ...data,
      ],
    },
    { name: 'نگاشت فیلدهای Manage', rows: [['نگاشت فیلدها', 'فیلد / بخش مقصد', 'قاعده انتقال'], ['نام مالک | F', 'customer.fullName', 'نمونه']] },
  ]);
}

/** Downloadable synthetic sample covering the cases the preview distinguishes. */
export function sampleWorkbook(): Uint8Array {
  return buildVehicleWorkbook(
    [
      {
        'شماره کارت پذیرش': '۹۰۰۰۱',
        'تاریخ پذیرش': '۱۴۰۵/۰۷/۲۰',
        'ساعت پذیرش (اگر معلوم است)': '۰۹:۱۵',
        'شماره شاسی ثبت‌شده': 'TST00001',
        خودرو: 'دنا پلاس',
        'نام مالک': 'مالک نمونه یک',
        'پوشش مندرج در لیست': 'کارت طلایی',
        'نوع پوشش تأییدشده': 'کارت طلایی / امداد خودرو',
        'وضعیت فعلی تعمیر': 'در حال تعمیر',
        'اقدام بعدی': 'صافکاری گلگیر جلو',
        'واحد درگیر': 'صافکاری',
        'توضیحات فعلی — عین برگه': 'متن نمونه برگه اولیه',
      },
      {
        'شماره کارت پذیرش': '۹۰۰۰۲',
        'تاریخ پذیرش': '۱۴۰۵/۰۷/۲۵',
        'شماره شاسی ثبت‌شده': 'TST00002',
        خودرو: 'رانا',
        'نام مالک': 'مالک نمونه دو',
        'پوشش مندرج در لیست': 'بیمه',
        'وضعیت فعلی تعمیر': 'انتظار قطعه',
        'مانع اصلی': 'قطعه نرسیده',
        'قطعه معطل‌کننده (در صورت وجود)': 'چراغ جلو',
      },
      { 'شماره کارت پذیرش': 'بدون پذیرش', 'شماره شاسی ثبت‌شده': 'TST00003', خودرو: 'تارا', 'نام مالک': 'مالک نمونه سه' },
      { 'شماره کارت پذیرش': '۹۰۰۰۴', 'تاریخ پذیرش': '۱۴۰۵/۱۳/۰۱', 'شماره شاسی ثبت‌شده': 'TST00004', خودرو: 'سورن', 'وضعیت فعلی تعمیر': 'پذیرش' },
    ],
    2,
  );
}
