import { writeWorkbook } from '../parts/xlsx';
import { stoppageColumns } from './stoppage-columns';

// H4 part 7: «گزارش جزئی اکسل» of «گزارش توقف خودرو» — column names only. Invented headers and values.
describe('stoppage report column preview', () => {
  it('finds the column-names row under title lines and counts filled rows per column, without returning values', () => {
    const file = writeWorkbook([{ name: 'گزارش', rows: [
      ['گزارش توقف خودرو'],
      ['از تاریخ ۱۴۰۵/۰۸/۰۱ تا ۱۴۰۵/۰۹/۰۷'],
      ['ستون الف', 'ستون ب', 'ستون ج', 'ستون الف'],
      ['TESTCHASSIS1', '۱۴۰۵/۰۹/۰۱', '', 'x'],
      ['TESTCHASSIS2', '', 'مقدار ساختگی', ''],
      [],
    ] }]);
    const p = stoppageColumns('stop.xlsx', file);
    expect(p).toMatchObject({ format: 'xlsx', sheetName: 'گزارش', headerRow: 3, rows: 2, blocked: null });
    expect(p.columns).toEqual([
      { header: 'ستون الف', filled: 2 }, { header: 'ستون ب', filled: 1 }, { header: 'ستون ج', filled: 1 }, { header: 'ستون الف (2)', filled: 1 },
    ]);
    expect(JSON.stringify(p)).not.toContain('TESTCHASSIS');
    expect(p.importer.readable).toBe(false);
  });

  it('reads an .xls that is a web page (HTML table)', () => {
    const html = '<html><body><table><tr><td>عنوان یک</td><td>عنوان دو</td><td>عنوان سه</td></tr><tr><td>1</td><td>الف</td><td></td></tr></table></body></html>';
    const p = stoppageColumns('stop.xls', new TextEncoder().encode(html));
    expect(p).toMatchObject({ format: 'html_table', headerRow: 1, rows: 1, columns: [{ header: 'عنوان یک', filled: 1 }, { header: 'عنوان دو', filled: 1 }, { header: 'عنوان سه', filled: 0 }] });
  });

  it('blocks what it cannot read and never guesses a header from values', () => {
    expect(stoppageColumns('x.xlsx', new Uint8Array()).blocked).toBe('فایل خالی است.');
    expect(stoppageColumns('x.bin', new TextEncoder().encode('not a spreadsheet')).blocked).toBeTruthy();
    const numbers = writeWorkbook([{ name: 'S', rows: [['1', '2', '3'], ['4', '5', '6']] }]);
    expect(stoppageColumns('n.xlsx', numbers)).toMatchObject({ headerRow: null, columns: [], blocked: expect.stringContaining('نام ستون') });
  });
});
