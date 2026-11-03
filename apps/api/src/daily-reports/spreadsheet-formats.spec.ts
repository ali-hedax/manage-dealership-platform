import { buildEmdadXml, buildStockXlsx, emdadRow, EMDAD_HEADERS } from './fixtures';
import { detectFormat, readSpreadsheetML, SpreadsheetError } from './spreadsheet-formats';

describe('daily report formats', () => {
  it('detects the real format from content, not the extension', () => {
    expect(detectFormat(buildEmdadXml([emdadRow(1)]))).toBe('spreadsheetml');
    expect(detectFormat(buildStockXlsx([{ 'کد کالا': '_x001F_ 1234567801' }]))).toBe('xlsx');
    expect(detectFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('xls_binary');
    expect(detectFormat(new TextEncoder().encode('<html><body>not a sheet</body></html>'))).toBe('unknown');
  });

  it('reads SpreadsheetML with leading whitespace and bare ampersands, counting each repair', () => {
    const file = buildEmdadXml([emdadRow(1), emdadRow(2, { 'شرح اختصاصی': 'A & B &C' })]);
    const r = readSpreadsheetML(file);
    expect(r.sheetName).toBe('گزارش امداد ویژه');
    expect(r.diagnostics.leadingWhitespace).toBe(1);
    expect(r.diagnostics.unescapedAmpersands).toBe(3); // 1 + 2 in the two description cells
    const rows = [...r.rows()];
    expect(rows[0]).toEqual([...EMDAD_HEADERS]);
    expect(rows).toHaveLength(4); // header + 2 + totals
    expect(rows[2]![EMDAD_HEADERS.indexOf('شرح اختصاصی')]).toBe('A & B &C');
  });

  it('honours sparse cells (ss:Index) and keeps empty columns empty', () => {
    const rows = [...readSpreadsheetML(buildEmdadXml([emdadRow(1, { 'كد تداركاتي كالا': '' })], { sparse: true })).rows()];
    expect(rows[1]![EMDAD_HEADERS.indexOf('كد تداركاتي كالا')]).toBe('');
    expect(rows[1]![EMDAD_HEADERS.indexOf('شماره امداد ویژه')]).toBe('700001');
  });

  it('refuses DTD/ENTITY, unclosed rows and limits instead of guessing', () => {
    const evil = new TextEncoder().encode('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="a"><Table><Row><Cell><Data>&e;</Data></Cell></Row></Table></Worksheet></Workbook>');
    expect(() => readSpreadsheetML(evil)).toThrow(SpreadsheetError);
    const broken = new TextEncoder().encode('<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="a"><Table><Row><Cell><Data>x</Data></Cell></Table></Worksheet></Workbook>');
    expect(() => [...readSpreadsheetML(broken).rows()]).toThrow(SpreadsheetError);
    const many = buildEmdadXml([emdadRow(1), emdadRow(2), emdadRow(3)]);
    expect(() => [...readSpreadsheetML(many, { limits: { maxRows: 2 } }).rows()]).toThrow('تعداد ردیف');
  });

  it('reads a synthetic file of the real size (~23.6 MB) within time and memory bounds', () => {
    const rows = Array.from({ length: 5200 }, (_, i) => emdadRow(i, { 'شرح اختصاصی': `قطعه ساختگی ${i} & ${'x'.repeat(3000)}` }));
    const file = buildEmdadXml(rows);
    expect(file.length).toBeGreaterThan(20_000_000);
    const before = process.memoryUsage().heapUsed;
    const t = Date.now();
    let n = 0;
    for (const row of readSpreadsheetML(file).rows()) if (row.length) n += 1;
    expect(n).toBe(5202);
    expect(Date.now() - t).toBeLessThan(30_000);
    // The reader keeps one copy of the sheet text plus the current row.
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(300 * 1024 * 1024);
  });
});
