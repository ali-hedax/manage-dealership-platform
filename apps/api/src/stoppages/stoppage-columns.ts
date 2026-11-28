import { headerKey, parseStoppageGrid, toLatinDigits, type StoppageColumnsPreview } from '@manage/shared';
import { detectFormat, FORMAT_ERRORS, readHtmlTable, readSpreadsheetML, SpreadsheetError } from '../daily-reports/spreadsheet-formats';
import { readWorkbook, XlsxError } from '../parts/xlsx';

const MAX_BYTES = 5_000_000;
/** The column names are looked for in the first rows only (title lines may come before them). */
const HEADER_SCAN = 20;
const text = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
/** A cell that is only a number, a date or a time is a value, never a column name. */
const looksLikeValue = (v: string) => /^[\d\s/\-:.,+]+$/.test(toLatinDigits(v));

/**
 * Column names of a «گزارش توقف خودرو → گزارش جزئی اکسل» file (H4 part 7). The file is read in memory and
 * dropped; only the names of the columns, the number of data rows and how many rows fill each column
 * leave this function. The column-names row is the first of the opening rows with at least three cells
 * and no cell that is only a number or a date. Nothing is mapped: what each column means is decided later.
 */
export function stoppageColumns(fileName: string, data: Uint8Array): StoppageColumnsPreview {
  const base = { fileName, sheetName: null, headerRow: null, rows: 0, columns: [], importer: { readable: false, problem: null } };
  if (!data?.length) return { ...base, format: 'unknown', blocked: 'فایل خالی است.' };
  if (data.length > MAX_BYTES) return { ...base, format: 'unknown', blocked: 'فایل بزرگ‌تر از ۵ مگابایت است؛ بازهٔ تاریخ گزارش را کوتاه‌تر کنید.' };
  const format = detectFormat(data);
  let grid: string[][];
  let sheetName: string;
  try {
    if (format === 'xlsx') {
      const sheet = readWorkbook(data)[0]!;
      [grid, sheetName] = [sheet.rows, sheet.name];
    } else if (format === 'spreadsheetml') {
      const read = readSpreadsheetML(data);
      [grid, sheetName] = [[...read.rows()], read.sheetName];
    } else if (format === 'html_table') {
      const read = readHtmlTable(data);
      [grid, sheetName] = [read.rows, read.sheetName];
    } else return { ...base, format, blocked: FORMAT_ERRORS[format] };
  } catch (e) {
    if (e instanceof XlsxError || e instanceof SpreadsheetError) return { ...base, format, blocked: e.message };
    throw e;
  }
  const rows = grid.map((r) => r.map(text));
  const headerIndex = rows.slice(0, HEADER_SCAN).findIndex((r) => {
    const cells = r.filter(Boolean);
    return cells.length >= 3 && !cells.some(looksLikeValue);
  });
  // Whatever the result above, the existing import says for itself whether it reads this layout.
  let importer: StoppageColumnsPreview['importer'];
  try {
    const parsed = parseStoppageGrid(grid, sheetName);
    importer = { readable: !parsed.headerProblem && parsed.rows.length > 0, problem: parsed.headerProblem };
  } catch {
    importer = { readable: false, problem: 'ورود فعلی «خودروهای متوقف» این فایل را نمی‌خواند.' };
  }
  if (headerIndex < 0) return { ...base, format, sheetName, importer, blocked: 'ردیف نام ستون‌ها در ۲۰ ردیف اول فایل پیدا نشد.' };
  const header = rows[headerIndex]!;
  const data_ = rows.slice(headerIndex + 1).filter((r) => r.some(Boolean));
  const width = Math.max(header.length, ...data_.map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => ({
    header: header[i] || `ستون ${i + 1} (بدون نام)`,
    filled: data_.filter((r) => !!r[i]).length,
  })).filter((c, i) => !!header[i] || c.filled > 0);
  // Two columns with the same name are told apart by their position.
  const seen = new Map<string, number>();
  for (const c of columns) {
    const key = headerKey(c.header);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) c.header = `${c.header} (${n})`;
  }
  return { fileName, format, sheetName, headerRow: headerIndex + 1, rows: data_.length, columns, importer, blocked: null };
}
