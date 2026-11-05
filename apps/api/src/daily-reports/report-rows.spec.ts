import { readWorkbook } from '../parts/xlsx';
import { buildEmdadXml, buildStockXlsx, emdadRow } from './fixtures';
import { emdadStatusCategory, parseEmdadSheet, parseStockSheet } from './report-rows';
import { readSpreadsheetML } from './spreadsheet-formats';

const stockRows = (rows: Parameters<typeof buildStockXlsx>[0]) => parseStockSheet(readWorkbook(buildStockXlsx(rows))[0]!.rows);
const emdadRows = (rows: Parameters<typeof buildEmdadXml>[0]) => parseEmdadSheet([...readSpreadsheetML(buildEmdadXml(rows)).rows()]);

describe('stock report rows', () => {
  it('keeps raw codes, leading zeros, letter codes, exact decimals and independent prices', () => {
    const r = stockRows([
      { 'کد کالا': '_x001F_ 0012345601', 'شرح کالا': 'قطعه ساختگی', 'واحد شمارش': 'عدد', 'موجودي': '۲', 'قيمت ميانگين': '1234.125', 'قيمت فروش': '1500', 'آدرس': 'A-1' },
      { 'کد کالا': '_x001F_ 0012345699', 'موجودي': '0.888', 'واحد شمارش': '0.888 ليتر', 'آدرس': 'A-2' },
      { 'کد کالا': '_x001F_ 123456789AB', 'موجودي': '1', 'آدرس': 'B-1' },
      { 'کد کالا': '', 'موجودي': '1' },
      { 'کد کالا': '_x001F_ 0012345602', 'موجودي': '-1' },
    ]);
    expect(r.headerRow).toBe(1);
    const [a, b, c, d, e] = r.rows;
    expect(a!.data).toMatchObject({ rawCode: '_x001F_ 0012345601', fullStockCode: '0012345601', basePartNumber: '00123456', supplySuffix: '01', quantity: '2', avgPrice: '1234.125', salePrice: '1500' });
    expect(b!.data.quantity).toBe('0.888');
    expect(c!.outcome).toBe('needs_mapping');
    expect(c!.data.basePartNumber).toBeNull();
    expect([d!.outcome, e!.outcome]).toEqual(['invalid', 'invalid']);
  });

  it('never sums the same code in the same location; it is kept for review', () => {
    const r = stockRows([
      { 'کد کالا': '1234567801', 'موجودي': '1', 'آدرس': 'A' },
      { 'کد کالا': '1234567801', 'موجودي': '2', 'آدرس': 'A' },
      { 'کد کالا': '1234567801', 'موجودي': '3', 'آدرس': 'B' },
    ]);
    expect(r.rows.map((x) => x.outcome)).toEqual(['duplicate', 'duplicate', 'valid']);
  });
});

describe('Emdad report rows', () => {
  it('drops the totals row with a reason, never copies contact data, and keys rows on five stable identifiers', () => {
    const r = emdadRows([emdadRow(1), emdadRow(2)]);
    expect(r.missingColumns).toEqual([]);
    expect(r.rows.map((x) => x.outcome)).toEqual(['valid', 'valid', 'total_row']);
    const json = JSON.stringify(r.rows[0]!.data);
    expect(json).not.toContain('مالک ساختگی');
    expect(json).not.toContain('09000000000');
    expect(json).not.toContain('ENG-TEST');
    expect(r.rows[0]!.key).toBe('900001|T00001AB|700001|500001|12345601');
  });

  it('keeps code differences and empty full codes for review without correcting them', () => {
    const r = emdadRows([
      emdadRow(1, { 'كد تداركاتي كالا': '' }),
      emdadRow(2, { 'كد تداركاتي كالا': '9999999901', 'کد قطعه': '12345602' }),
      emdadRow(3, { 'کد اختصاصی اولیه': '12345699' }),
    ]);
    expect(r.rows[0]!.data.fullCodeKind).toBe('missing');
    expect(r.rows[1]!.data.fullCode).toBe('9999999901');
    expect(r.rows[1]!.data.codeNotes.join()).toContain('پایه کد کامل با «کد قطعه» فرق دارد');
    expect(r.rows[2]!.data.codeNotes.join()).toContain('کد اختصاصی اولیه');
  });

  it('marks rows without a full key as ambiguous and same-key rows as duplicates; unknown status is kept raw', () => {
    const r = emdadRows([
      emdadRow(1, { 'شماره کارت پذيرش': '' , 'شماره شاسی': 'X1234567' }),
      emdadRow(2),
      emdadRow(2),
      emdadRow(4, { 'وضعیت امداد ویژه': 'وضعیت تازه ساختگی' }),
    ]);
    expect(r.rows.map((x) => x.outcome).slice(0, 4)).toEqual(['ambiguous', 'duplicate', 'duplicate', 'valid']);
    expect(r.rows[3]!.messages.join()).toContain('نیازمند تفسیر وضعیت');
    expect(emdadStatusCategory('وارد موجودی شده است')).toBe('in_dealer_stock');
    expect(emdadStatusCategory('وضعیت تازه ساختگی')).toBe('needs_interpretation');
  });
});
