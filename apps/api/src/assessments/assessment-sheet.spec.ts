import { readFileSync } from 'node:fs';
import { parseAssessmentSheet } from './assessment-sheet';
import { writeSheet, writeWorkbook } from '../parts/xlsx';
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
  expect(r.errors).toEqual([]); expect(r.rows).toHaveLength(2);
  expect(r.rows[0]).toMatchObject({action:'repair',partNumber:null,labourRial:500,unitPriceRial:0});
  expect(r.rows[1]).toMatchObject({action:'replace',partNumber:'00123456',quantity:2,unitPriceRial:1000});
  expect(r.setAside).toMatchObject([{kind:'part',status:'rejected',code:'00999999',amountRial:100}]);
  // An equivalent line without a status column is listed for review, never imported.
  expect(r.equivalents).toMatchObject([{description:'غیرقابل ورود',code:'TEST',status:'blank',amountRial:null}]);
  expect(r.warnings).toHaveLength(1);
});
it('detects reordered columns and converts explicitly selected toman without guessing approval', () => {
  const r = parseAssessmentSheet(writeSheet('آزمون',[['شرح قطعه','شماره فنی','تعداد','فی','مبلغ'],['قطعه ساختگی','00123456','1','100','100']]),'toman');
  expect(r.errors).toEqual([]); expect(r.rows[0]?.unitPriceRial).toBe(1000);
});
it('rejects duplicate rows, unknown and blank states, malformed quantities and inconsistent amounts', () => {
  expect(parse([header,line(),line()]).errors).toHaveLength(1);
  expect(parse([header,line('نامشخص')]).errors).toHaveLength(1);
  expect(parse([header,line(''),line()]).errors[0]?.message).toContain('وضعیت ردیف خالی');
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
  expect(r.errors).toEqual([]); expect(r.rows).toHaveLength(1);
  expect(r.setAside).toMatchObject([{kind:'labour',status:'correction',amountRial:100}]);
  expect(r.equivalents).toMatchObject([{status:'final',code:'TEST-EQ',amountRial:null}]);
  expect(r.summary.labour).toMatchObject({final:0,correction:1}); expect(r.summary.totalRial).toBe(2000);
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

it('keeps sparse part columns across printed continuation pages and recognizes equivalent labour by code', () => {
  const part1 = line();
  const part2 = sparse([[0,'نهايي'],[5,'3,000'],[9,'3,000'],[16,'1'],[19,'1405/08/09'],[25,'قطعه دوم ساختگی'],[38,'00000999']]);
  const partHeader = sparse([[0,'وضعیت'],[5,'مبلغ'],[9,'فی'],[16,'تعداد'],[19,'تاریخ'],[25,'شرح'],[38,'کد']]);
  const equivalentHeader = sparse([[0,'وضعیت'],[7,'شرح'],[34,'کد']]);
  const equivalent = sparse([[0,'نهايي'],[7,'تعویض قطعه ساختگی'],[34,'TEST-EQ-01']]);
  const r = parse([['قطعات'],partHeader,part1,
    sparse([[0,'1405/08/14'],[6,':زمان چاپ'],[10,'لیست قطعات و اجرتهای دستور کار']]),
    sparse([[0,'5'],[1,'از'],[2,'2'],[3,':صفحه'],[29,'TEST-0002'],[34,':شماره دستور کار']]),
    sparse([[35,':توضیحات کارشناس امدادخودرو']]),part2,
    ['اجرت های معادل'],equivalentHeader,equivalent,
    sparse([[0,'1405/08/14'],[6,':زمان چاپ']]),
    sparse([[0,'5'],[1,'از'],[2,'3'],[3,':صفحه']]),
    sparse([[35,':توضیحات کارشناس امدادخودرو']]),
    sparse([[0,'رد'],[7,'عملیات مردود'],[34,'TEST-EQ-02']])]);
  expect(r.errors).toEqual([]);
  expect(r.rows).toHaveLength(2);
  expect(r.rows[1]).toMatchObject({partNumber:'00000999',quantity:1,unitPriceRial:3000,page:2,date:'1405/08/09'});
  expect(r.rows[1]?.evidence).toContain('1405/08/09'); expect(r.rows[1]?.evidence).toContain('صفحه 2');
  expect(r.equivalents.map(e => [e.code, e.status, e.page])).toEqual([['TEST-EQ-01','final',2],['TEST-EQ-02','rejected',3]]);
  expect(r.summary.pages).toBe(5);
});

// --- A synthetic report shaped like the official multi-page export (no real data) ---
type Part = { status: string; qty: number; price: number; date: string; unit?: string; code?: string; name?: string };
const fmt = (n: number) => n.toLocaleString('en-US');
const meta = (page: number, total: number) => [
  sparse([[0,'1405/08/14'],[4,'12:35'],[6,':زمان چاپ'],[10,'لیست قطعات و اجرتهای دستور کار امداد خودرو'],[29,'TEST-0001'],[34,':شماره رخداد']]),
  sparse([[0,String(total)],[1,'از'],[2,String(page)],[3,':صفحه'],[12,'TESTVIN0001'],[22,':شماره شاسی'],[29,'TEST-0002'],[34,':شماره دستور کار']]),
  [], sparse([[31,'10'],[36,':فرانشیز']]), [],
  sparse([[0,'1405/07/08'],[13,':تاریخ دریافت دستور کار'],[24,'خدمات آزمون'],[40,':نوع دستور کار']]),
  sparse([[15,'0900000000'],[28,':شماره کارت تعمیراتی'],[32,'12345'],[41,':کیلومتر']]),
  sparse([[35,':توضیحات کارشناس امدادخودرو']]),
];
const partRow = (p: Part, i: number) => sparse([[0,p.status],[5,fmt(p.qty*p.price)],[9,fmt(p.price)],[11,p.unit ?? 'عدد'],[16,String(p.qty)],[19,p.date],[25,p.name ?? `قطعه ساختگی ${i}`],[38,p.code ?? `0${String(100000+i)}`]]);
const eqRow = (status: string, i: number) => sparse([[0,status],[7,`اجرت معادل ساختگی ${i}`],[34,`TEST${String(i).padStart(3,'0')}R0`]]);
function report(o: { parts: Part[]; equivalents: string[]; labour?: number; partsFooter?: number; totalOverride?: number; perPage?: number; extra?: string[][]; labourCode?: string }) {
  const labour = o.labour ?? 500_000;
  const finalParts = o.parts.filter(p => p.status === 'نهايي').reduce((n, p) => n + p.qty * p.price, 0);
  const body: string[][] = [['اجرت'], sparse([[0,'وضعیت'],[6,'مبلغ'],[15,'تاریخ'],[21,'شرح اجرت'],[37,'کد']]),
    sparse([[0,'نهايي'],[6,fmt(labour)],[15,'1405/07/08'],[21,'اجرت خسارتی ساختگی'],[37,o.labourCode ?? 'TEST-LAB']]), sparse([[6,fmt(labour)]]),
    ['قطعات'], sparse([[0,'وضعیت'],[5,'مبلغ'],[9,'فی'],[11,'واحد'],[16,'تعداد'],[19,'تاریخ'],[25,'شرح'],[38,'کد']]),
    ...o.parts.map(partRow), sparse([[5,fmt(o.partsFooter ?? finalParts)]]), ...(o.extra ?? []), [],
    ['اجرت های معادل'], sparse([[0,'وضعیت'],[7,'شرح'],[34,'کد']]), ...o.equivalents.map(eqRow)];
  // Split into printed pages, each opening with the repeated report header.
  const perPage = o.perPage ?? 8, pages = Math.ceil(body.length / perPage), rows: string[][] = [];
  for (let p = 0; p < pages; p++) rows.push(...meta(p + 1, pages), ...body.slice(p * perPage, (p + 1) * perPage), []);
  rows.push(sparse([[0,'0'],[22,':سقف خسارت']]), sparse([[0,fmt(labour)],[22,':مبلغ اجرت خسارتی تعیین شده توسط کارشناس']]),
    sparse([[0,fmt(o.totalOverride ?? finalParts + labour)],[22,':جمع مبلغ قطعه و اجرت بدون احتساب مالیات']]));
  return { rows, pages, finalParts, labour };
}
const dates = ['1405/07/08','1405/07/15','1405/08/03'];
const sampleParts: Part[] = Array.from({ length: 14 }, (_, i) => ({
  status: [3, 9].includes(i) ? 'رد' : 'نهايي', qty: i % 4 === 0 ? 2 : 1, price: 1_000_000 + i * 12_345, date: dates[i % 3]!,
  unit: i === 5 ? '0.888 ليتر' : undefined,
}));
const sampleEquivalents = Array.from({ length: 11 }, (_, i) => [2, 7].includes(i) ? 'رد' : 'نهايي');

it('reads a multi-page report end to end: per-row dates and pages, rejected rows and equivalent labour kept apart, printed totals verified', () => {
  const doc = report({ parts: sampleParts, equivalents: sampleEquivalents });
  const r = parse(doc.rows);
  expect(r.errors).toEqual([]); expect(r.warnings).toEqual([]);
  expect(r.summary.pages).toBe(doc.pages); expect(doc.pages).toBeGreaterThan(3);
  expect(r.summary.parts).toEqual({ final: 12, rejected: 2, correction: 0, unknown: 0 });
  expect(r.summary.labour).toEqual({ final: 1, rejected: 0, correction: 0, unknown: 0 });
  expect(r.summary.equivalents).toEqual({ final: 9, rejected: 2, correction: 0, unknown: 0 });
  expect(r.rows.filter(x => x.action === 'replace')).toHaveLength(12);
  expect(r.setAside.every(x => x.status === 'rejected' && x.kind === 'part')).toBe(true);
  expect(r.summary.partsRial).toBe(doc.finalParts); expect(r.summary.labourRial).toBe(doc.labour);
  expect(r.summary.totalRial).toBe(doc.finalParts + doc.labour);
  expect(r.summary.declared).toEqual({ partsRial: doc.finalParts, labourRial: doc.labour, totalRial: doc.finalParts + doc.labour });
  expect(r.summary.dates).toEqual(dates);
  // Each row keeps its own date and printed page; the report header date is not copied onto items.
  expect(new Set(r.rows.map(x => x.page)).size).toBeGreaterThan(1);
  expect(r.rows.filter(x => x.action === 'replace').map(x => x.date)).toEqual(sampleParts.filter(p => p.status === 'نهايي').map(p => p.date));
  expect(r.rows.find(x => x.unit === '0.888 ليتر')?.evidence).toContain('واحد 0.888 ليتر');
  // Equivalent labour has no amount of its own and adds nothing to the totals.
  expect(r.equivalents.every(e => e.amountRial === null)).toBe(true);
  expect(r.rows.some(x => x.description.startsWith('اجرت معادل'))).toBe(false);
});
it('blocks a report whose printed total disagrees with the final rows, and only warns when a row awaits correction', () => {
  const missing = parse(report({ parts: sampleParts, equivalents: sampleEquivalents, partsFooter: 1 }).rows);
  expect(missing.errors.map(e => e.message).join()).toContain('جمع قطعات');
  const grand = parse(report({ parts: sampleParts, equivalents: sampleEquivalents, totalOverride: 1 }).rows);
  expect(grand.errors.map(e => e.message).join()).toContain('جمع مبلغ قطعه و اجرت');
  const review = parse(report({ parts: [...sampleParts, { status: 'درخواست اصلاح', qty: 1, price: 5, date: '1405/08/03' }], equivalents: sampleEquivalents, partsFooter: 1 }).rows);
  expect(review.errors).toEqual([]); expect(review.warnings.length).toBeGreaterThan(0);
  expect(review.setAside.some(x => x.status === 'correction')).toBe(true);
});
it('keeps an item whose description contains a report label word and keeps leading zeros and Persian digits in codes', () => {
  const r = parse(report({ parts: [{ status: 'نهايي', qty: 1, price: 10, date: '1405/07/08', name: 'کیلومتر شمار ساختگی', code: '۰۰۰۱۲۳' },
    { status: 'نهايي', qty: 1, price: 20, date: '1405/07/08', name: 'شماره خودرو ساختگی', code: '0000456' }], equivalents: [] }).rows);
  expect(r.errors).toEqual([]);
  expect(r.rows.filter(x => x.action === 'replace').map(x => [x.description, x.partNumber])).toEqual([['کیلومتر شمار ساختگی','000123'],['شماره خودرو ساختگی','0000456']]);
});
it('reports rows that follow a closed table instead of dropping them', () => {
  const r = parse(report({ parts: sampleParts.slice(0, 2), equivalents: [], extra: [partRow({ status: 'نهايي', qty: 1, price: 7, date: '1405/08/03' }, 99)] }).rows);
  expect(r.errors.map(e => e.message).join()).toContain('پس از جمع جدول');
});
it('reads several independent sheets and reports a sheet without a table', () => {
  const a = report({ parts: sampleParts.slice(0, 3), equivalents: ['نهايي'] });
  const b = report({ parts: sampleParts.slice(5, 8).map(p => ({ ...p, code: `9${p.price}` })), equivalents: ['رد'], labour: 200_000, labourCode: 'TEST-LAB-2' });
  const r = parseAssessmentSheet(writeWorkbook([{ name: 'برگ ۱', rows: a.rows }, { name: 'برگ ۲', rows: b.rows }, { name: 'یادداشت', rows: [['متن آزاد ساختگی']] }]), 'rial');
  expect(r.errors).toEqual([]);
  expect(r.summary.sheets).toBe(3); expect(r.summary.labour.final).toBe(2);
  expect(r.summary.totalRial).toBe(a.finalParts + a.labour + b.finalParts + b.labour);
  expect(r.summary.declared.totalRial).toBe(r.summary.totalRial);
  expect(r.equivalents.map(e => e.sheet)).toEqual(['برگ ۱', 'برگ ۲']);
  expect(r.skipped.some(x => x.sheet === 'یادداشت')).toBe(true);
});
it('follows moved columns through headers that name date and unit in other positions', () => {
  const r = parse([['قطعات'], ['تعداد','شرح قطعه','واحد','کد فنی','وضعیت','تاریخ','فی','مبلغ'], ['3','قطعه ساختگی','عدد','00777','تأیید شده','1405/08/01','10','30']]);
  expect(r.errors).toEqual([]);
  expect(r.rows[0]).toMatchObject({ partNumber: '00777', quantity: 3, unitPriceRial: 10, date: '1405/08/01', unit: 'عدد' });
});
it('gives the same preview for the same file twice (the import itself matches earlier items)', () => {
  const doc = report({ parts: sampleParts, equivalents: sampleEquivalents });
  expect(parse(doc.rows)).toEqual(parse(doc.rows));
});

// Owner-supplied workbook, read only from a local path; it is never committed.
// ASSESSMENT_REAL_XLSX="C:\...\کارشناسی 18064.xlsx" pnpm --filter @manage/api test -- assessment-sheet
const real = process.env.ASSESSMENT_REAL_XLSX;
(real ? it : it.skip)('reads the owner-supplied multi-page assessment workbook completely', () => {
  const r = parseAssessmentSheet(new Uint8Array(readFileSync(real!)), 'rial');
  expect(r.errors).toEqual([]); expect(r.warnings).toEqual([]);
  expect(r.summary.pages).toBe(5);
  expect(r.summary.parts).toEqual({ final: 59, rejected: 7, correction: 0, unknown: 0 });
  expect(r.summary.labour).toEqual({ final: 1, rejected: 0, correction: 0, unknown: 0 });
  expect(r.summary.equivalents).toEqual({ final: 80, rejected: 6, correction: 0, unknown: 0 });
  expect(r.summary.partsRial).toBe(2_698_562_228); expect(r.summary.labourRial).toBe(871_500_000); expect(r.summary.totalRial).toBe(3_570_062_228);
  expect(r.summary.declared).toEqual({ partsRial: 2_698_562_228, labourRial: 871_500_000, totalRial: 3_570_062_228 });
  expect(r.summary.dates.length).toBeGreaterThan(1);
});
