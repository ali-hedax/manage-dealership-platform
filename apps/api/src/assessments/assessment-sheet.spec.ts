import { parseAssessmentSheet } from './assessment-sheet';
import { writeSheet } from '../parts/xlsx';
import { emdadMatchesNeed } from '../daily-reports/emdad.service';

// Synthetic sparse PDF layout only; no source customer workbook is copied here.
const sparse = (entries: [number, string][]) => {
  const row = Array<string>(42).fill(''); for (const [col, value] of entries) row[col] = value; return row;
};
const header = sparse([[0,'وضعیت'],[5,'مبلغ'],[9,'فی'],[16,'تعداد'],[25,'شرح'],[38,'کد']]);
const line = (status = 'نهايي') => sparse([[0,status],[5,'۲٬۰۰۰'],[9,'۱٬۰۰۰'],[16,'۲'],[25,'قطعه ساختگی'],[38,'00123456']]);
const parse = (rows: string[][]) => parseAssessmentSheet(writeSheet('آزمون', rows), 'rial');

it('reads sparse headers, independent labour and repeated page headers without treating report metadata as items', () => {
  const r = parse([['عنوان گزارش'], ['اجرت'], sparse([[0,'وضعیت'],[6,'مبلغ'],[21,'شرح اجرت'],[37,'کد']]),
    sparse([[0,'نهايي'],[6,'۵۰۰'],[21,'اجرت ساختگی'],[37,'TEST-LABOUR']]), ['قطعات'],header,line(),header,
    sparse([[0,'رد'],[5,'100'],[9,'100'],[16,'1'],[25,'ردشده'],[38,'00999999']]), ['اجرت های معادل'],['شرح','کد'],['غیرقابل ورود','TEST']]);
  expect(r.errors).toEqual([]); expect(r.rows).toHaveLength(2); expect(r.skipped).toHaveLength(2);
  expect(r.rows[0]).toMatchObject({action:'repair',partNumber:null,labourRial:500,unitPriceRial:0});
  expect(r.rows[1]).toMatchObject({action:'replace',partNumber:'00123456',quantity:2,unitPriceRial:1000});
});
it('detects reordered columns and converts explicitly selected toman without guessing approval', () => {
  const r = parseAssessmentSheet(writeSheet('آزمون',[['شرح قطعه','شماره فنی','تعداد','فی','مبلغ'],['قطعه ساختگی','00123456','1','100','100']]),'toman');
  expect(r.errors).toEqual([]); expect(r.rows[0]?.unitPriceRial).toBe(1000);
});
it('rejects duplicate rows, unknown states, malformed quantities and inconsistent amounts', () => {
  expect(parse([header,line(),line()]).errors).toHaveLength(1);
  expect(parse([header,line('نامشخص')]).errors).toHaveLength(1);
  const qty = line(); qty[16] = '0'; expect(parse([header,qty]).errors).toHaveLength(1);
  const total = line(); total[5] = '2001'; expect(parse([header,total]).errors).toHaveLength(1);
});
it('rejects arbitrary or invalid workbooks instead of interpreting their first rows as needs', () => {
  expect(parse([['نام','تلفن'],['آزمون','09000000000']]).errors.length).toBeGreaterThan(0);
  expect(parseAssessmentSheet(new Uint8Array([1,2,3]),'rial').errors.length).toBeGreaterThan(0);
});
it('separates correction requests and unpriced equivalent labour from the valid parts', () => {
  const r = parse([['اجرت'],['وضعیت','مبلغ','شرح اجرت','کد'],['درخواست اصلاح','100','اجرت ساختگی','TEST-L'],
    ['قطعات'],header,line(),['اجرت های معادل'],['وضعیت','شرح','کد'],['نهايي','معادل ساختگی','TEST-EQ']]);
  expect(r.errors).toEqual([]); expect(r.rows).toHaveLength(1); expect(r.skipped).toHaveLength(3);
});
it('does not guess a blank amount is free or ignore an explicit currency header', () => {
  const empty = line(); empty[5]=''; empty[9]=''; expect(parse([header,empty]).errors).toHaveLength(1);
  expect(parseAssessmentSheet(writeSheet('آزمون',[['شرح قطعه','شماره فنی','تعداد','فی (تومان)'],['قطعه','00123456','1','100']]),'rial').errors).toHaveLength(1);
});
it('only relates matching technical codes; a full supply option cannot silently change', () => {
  const o = {partCode:'00123456',initialCode:'00123456',fullCodeBase:'00123456',fullCode:'0012345601'};
  expect(emdadMatchesNeed(o,'۰۰۱۲۳۴۵۶')).toBe(true);
  expect(emdadMatchesNeed(o,'0012345601')).toBe(true);
  expect(emdadMatchesNeed(o,'0012345602')).toBe(false);
  expect(emdadMatchesNeed(o,'00999999')).toBe(false);
  expect(emdadMatchesNeed({...o,initialCode:'00999999'},'00123456')).toBe(false);
});
