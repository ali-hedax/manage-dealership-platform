import { writeWorkbook } from '../parts/xlsx';

// Synthetic files with the same layout as the dealership's daily exports
// (headers copied from the real templates; every value is invented). Used by
// tests and the downloadable samples. Never put real report rows here.

export const EMDAD_HEADERS = [
  'شماره کارت پذيرش',
  'تاريخ پذيرش',
  'نام مالك',
  'تلفن همراه مالك',
  'شماره شاسی',
  'شماره موتور',
  'پلاك',
  'تاریخ ثبت امداد ویژه',
  'شماره امداد ویژه',
  'كد تداركاتي كالا',
  'شرح اختصاصی',
  'تعداد اختصاصي',
  'وضعيت ارسال درخواست به امداد ويژه',
  'دلائل ابطال امداد ویژه',
  'تاریخ و زمان ابطال امداد ویژه',
  'تاريخ رسيد شدن امداد ويژه در انبار',
  'شرح محصول',
  'وضعیت کارت',
  'سالن تعمیرات',
  'وضعیت کارت طلایی',
  'زمان انتظار امداد ویژه',
  'شماره درخواست',
  'کد اختصاصی اولیه',
  'کد قطعه',
  'شرح تدارکاتی',
  'تعداد تداركاتي',
  'وضعیت امداد ویژه',
  'نحوه ارسال قطعه',
  'تاریخ و زمان خروج قطعه',
  'پذیرش تا ترخیص (روز)',
  'تاريخ ترخيص',
  'شماره فاکتور',
  'علت توقف',
  'وضعیت گارانتی',
  'تاريخ اعتبار كارت طلائي',
] as const;
export type EmdadHeader = (typeof EMDAD_HEADERS)[number];
export type EmdadRow = Partial<Record<EmdadHeader, string>>;

const xmlText = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * SpreadsheetML like the real export: a newline before the XML declaration,
 * bare "&" inside text (not escaped), a header row, the rows, and a totals row.
 */
export function buildEmdadXml(rows: EmdadRow[], opts: { totals?: boolean; sparse?: boolean } = {}): Uint8Array {
  const row = (cells: string[]) =>
    `<Row>${cells
      .map((v, i) => (opts.sparse && !v ? '' : `<Cell${opts.sparse ? ` ss:Index="${i + 1}"` : ''}><Data ss:Type="String">${xmlText(v)}</Data></Cell>`))
      .join('')}</Row>`;
  const body = [
    row([...EMDAD_HEADERS]),
    ...rows.map((r) => row(EMDAD_HEADERS.map((h) => r[h] ?? ''))),
    ...(opts.totals === false ? [] : [row(EMDAD_HEADERS.map((h) => (h === 'تعداد اختصاصي' || h === 'تعداد تداركاتي' ? String(rows.length) : h === 'زمان انتظار امداد ویژه' ? '0' : '')))]),
  ].join('\n');
  return new TextEncoder().encode(
    `\n<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="گزارش امداد ویژه"><Table>\n${body}\n</Table></Worksheet></Workbook>\n`,
  );
}

export const STOCK_HEADERS = ['کد کالا', 'شرح کالا', 'واحد شمارش', 'مدل خودرو', 'موجودي', 'قيمت ميانگين', 'قيمت فروش', 'آدرس', 'شرح لوکيشن', 'وضعيت مبنا'] as const;
export type StockHeader = (typeof STOCK_HEADERS)[number];
export type StockRow = Partial<Record<StockHeader, string>>;

/** XLSX like the stock export: one sheet, header on row 1, codes with the "_x001F_ " prefix. */
export function buildStockXlsx(rows: StockRow[], sheet = 'stkstock (3)'): Uint8Array {
  return writeWorkbook([{ name: sheet, rows: [[...STOCK_HEADERS], ...rows.map((r) => STOCK_HEADERS.map((h) => r[h] ?? ''))] }]);
}

/** A synthetic Emdad row with a unique key; values are invented. */
export function emdadRow(i: number, over: EmdadRow = {}): EmdadRow {
  const n = String(i).padStart(5, '0');
  return {
    'شماره کارت پذيرش': `9${n}`,
    'تاريخ پذيرش': '1405/08/01',
    'نام مالك': 'مالک ساختگی',
    'تلفن همراه مالك': '09000000000',
    'شماره شاسی': `T${n}AB`.slice(0, 8),
    'شماره موتور': 'ENG-TEST',
    'پلاك': '11 ب 111 - 11',
    'تاریخ ثبت امداد ویژه': '1405/08/02',
    'شماره امداد ویژه': `7${n}`,
    'كد تداركاتي كالا': `123456${String(i % 100).padStart(2, '0')}01`,
    'شرح اختصاصی': 'قطعه ساختگی & لوازم',
    'تعداد اختصاصي': '1.00',
    'وضعيت ارسال درخواست به امداد ويژه': 'ارسال شده به امداد ویژه',
    'شماره درخواست': `5${n}`,
    'کد اختصاصی اولیه': `123456${String(i % 100).padStart(2, '0')}`,
    'کد قطعه': `123456${String(i % 100).padStart(2, '0')}`,
    'شرح تدارکاتی': 'قطعه ساختگی',
    'تعداد تداركاتي': '1',
    'وضعیت امداد ویژه': 'در حال تامین',
    'نحوه ارسال قطعه': 'غیر اضطراری',
    'وضعیت کارت': 'در حال تعمیر',
    ...over,
  };
}
