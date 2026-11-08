import { assessmentItemSchema, assessmentPartKey, normalizePersian, toLatinDigits, type AssessmentImportCounts, type AssessmentImportPreview, type AssessmentImportStatus } from '@manage/shared';
import { readWorkbook, XlsxError } from '../parts/xlsx';

const key = (s: string) => normalizePersian(toLatinDigits(s)).replace(/[\s‌:()«»]/g, '').trim();
const numeric = (s: string) => {
  const value = toLatinDigits(s).replace(/[,،٬\s]/g, '');
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
};
// Columns are found by their header text, never by a fixed position: the
// official export is sparse (status A, part amount F, labour amount G, …) and
// other templates order the columns differently.
const aliases = {
  description: ['شرح', 'شرح قطعه', 'نام قطعه', 'شرح اجرت', 'شرح عملیات'],
  code: ['کد', 'شماره فنی', 'کد فنی', 'شماره قطعه', 'کد کالا', 'کد اجرت'],
  quantity: ['تعداد'], price: ['فی', 'فی ریال', 'فی تومان', 'قیمت واحد', 'قیمت واحد ریال', 'قیمت واحد تومان'],
  amount: ['مبلغ', 'مبلغ کل', 'جمع مبلغ', 'مبلغ ریال', 'مبلغ تومان'], status: ['وضعیت'],
  date: ['تاریخ'], unit: ['واحد', 'واحد شمارش'],
};
type Field = keyof typeof aliases;
type Columns = Record<Field, number>;
/** replace = parts table, labour = main (damage) labour, equivalent = equivalent-labour breakdown. */
type Section = 'replace' | 'labour' | 'equivalent';
type Preview = AssessmentImportPreview;

const STATUSES: [AssessmentImportStatus, string[]][] = [
  ['final', ['نهایی', 'تایید', 'تاییدشده', 'تأیید', 'تأییدشده', 'مصوب', 'قطعی']],
  ['rejected', ['رد', 'ردشده', 'مردود', 'ابطال', 'باطل', 'حذف', 'لغو']],
  ['correction', ['درخواست اصلاح', 'نیازمند اصلاح']],
];
const statusOf = (text: string): AssessmentImportStatus => {
  const k = key(text);
  if (!k) return 'blank';
  return STATUSES.find(([, names]) => names.some(n => key(n) === k))?.[0] ?? 'unknown';
};
// Report header labels repeated on every printed page. A label cell carries a
// colon in the export (":شماره شاسی"); matching the label, not any substring,
// keeps an item whose description merely contains such a word.
const REPORT_LABELS = ['زمان چاپ', 'شماره دستور کار', 'شماره رخداد', 'شماره شاسی', 'شماره خودرو', 'تاریخ دریافت دستور کار', 'شرح خودرو',
  'نام و نام خانوادگی کارشناس', 'شماره کارت تعمیراتی', 'توضیحات کارشناس', 'مدت زمان تعمیرات', 'فرانشیز', 'کیلومتر', 'نوع دستور کار', 'سقف خسارت'].map(key);
const REPORT_TITLE = key('لیست قطعات و اجرت');
const SUMMARY_LABELS: [ 'labour' | 'total', string ][] = [['labour', key('مبلغ اجرت خسارتی')], ['total', key('جمع مبلغ قطعه و اجرت')]];
const END_OF_TABLE = /^(جمع|مجموع|لیستقطعات|توضیحات|امضا)/;
const fa = (n: number) => n.toLocaleString('fa-IR');

function pageMarker(values: string[]) {
  if (!values.some(v => key(v) === 'صفحه')) return null;
  const i = values.findIndex(v => key(v) === 'از');
  if (i < 1) return null;
  let total = numeric(values[i - 1] ?? ''), page = numeric(values[i + 1] ?? '');
  if (!Number.isInteger(total) || !Number.isInteger(page)) return null;
  if (page > total) [page, total] = [total, page];
  return { page, total };
}

/** Read only structural table headers, never infer identity or official approval. */
export function parseAssessmentSheet(data: Uint8Array, currency: 'rial' | 'toman'): AssessmentImportPreview {
  const counts = (): AssessmentImportCounts => ({ final: 0, rejected: 0, correction: 0, unknown: 0 });
  const result: Preview = {
    rows: [], errors: [], warnings: [], skipped: [], setAside: [], equivalents: [], applied: false,
    summary: { sheets: 0, pages: null, dates: [], parts: counts(), labour: counts(), equivalents: counts(), partsRial: 0, labourRial: 0, totalRial: 0, declared: { partsRial: null, labourRial: null, totalRial: null } },
  };
  const s = result.summary;
  const multiplier = currency === 'toman' ? 10 : 1;
  let sheets;
  try { sheets = readWorkbook(data); }
  catch (e) { result.errors.push({ sheet: '', row: 0, page: null, message: e instanceof XlsxError ? e.message : 'فایل خوانده نشد' }); return result; }
  s.sheets = sheets.length;
  const seen = new Set<string>(), seenEquivalent = new Set<string>(), dates = new Set<string>();
  let pages = 0, anyPage = false;
  for (const sheet of sheets) {
    let columns: Columns | null = null, closed: Columns | null = null, page: number | null = null;
    // Current table kind and the running sum of its final rows, in rial.
    const cur: { section: Section | null; rial: number; review: boolean } = { section: null, rial: 0, review: false };
    let sheetPages = 0, hadTable = false;
    // Sums of the rows read so far, in rial, to check the totals the file prints.
    let sheetParts = 0, sheetLabour = 0, sheetReview = false;
    const declared = { parts: null as number | null, labour: null as number | null };
    const at = (row: number) => ({ sheet: sheet.name, row, page });
    const error = (row: number, message: string) => result.errors.push({ ...at(row), message });
    // A printed total that disagrees means a row was missed or misread. When a
    // row awaits correction its inclusion in the printed total is unknown.
    const checkTotal = (row: number, label: string, declared: number, computed: number, review: boolean, strict = true) => {
      if (declared === computed) return;
      const message = `${label} درج‌شده در فایل (${fa(declared)} ریال) با جمع ردیف‌های نهایی (${fa(computed)} ریال) برابر نیست؛ ردیف جاافتاده یا نادرست را بررسی کنید`;
      if (strict && !review) error(row, message); else result.warnings.push({ ...at(row), message });
    };
    const enter = (next: Section) => { if (next !== cur.section) Object.assign(cur, { section: next, rial: 0, review: false }); };
    for (const [index, row] of sheet.rows.entries()) {
      const rowNo = index + 1;
      const values = row.map(v => v.trim());
      const nonempty = values.filter(Boolean);
      if (!nonempty.length) continue;
      const marker = pageMarker(values);
      if (marker) { page = marker.page; anyPage = true; sheetPages = Math.max(sheetPages, marker.page, marker.total); continue; }
      if (nonempty.some(v => key(v) === key('اجرت های معادل'))) {
        enter('equivalent'); columns = null; closed = null;
        result.skipped.push({ ...at(rowNo), reason: 'بخش اجرت‌های معادل: جدا نمایش داده می‌شود و به اقلام یا جمع اضافه نمی‌شود' });
        continue;
      }
      if (nonempty.length === 1 && ['قطعات', 'اجرت', 'اجرتها'].includes(key(nonempty[0]!))) { enter(key(nonempty[0]!) === 'قطعات' ? 'replace' : 'labour'); columns = null; closed = null; continue; }

      const labelIndex = values.findIndex((v, i) => SUMMARY_LABELS.some(([, l]) => key(v).startsWith(l)) && (v.includes(':') || !columns || i !== columns.description));
      if (labelIndex >= 0) {
        const summaryKind = SUMMARY_LABELS.find(([, l]) => key(values[labelIndex]!).startsWith(l))![0];
        const value = values.map(numeric).find((n, i) => i !== labelIndex && Number.isFinite(n));
        if (value !== undefined) {
          const printed = value * multiplier;
          if (summaryKind === 'labour') { declared.labour = printed; checkTotal(rowNo, 'مبلغ اجرت خسارتی', printed, sheetLabour, sheetReview); }
          else { s.declared.totalRial = (s.declared.totalRial ?? 0) + printed; checkTotal(rowNo, 'جمع مبلغ قطعه و اجرت', printed, sheetParts + sheetLabour, sheetReview); }
        }
        continue;
      }

      const detected = Object.fromEntries(Object.entries(aliases).map(([k, names]) => [k, values.findIndex(v => names.some(n => key(n) === key(v)))])) as Columns;
      if (detected.description >= 0 && detected.code >= 0) {
        const priced = detected.amount >= 0 || detected.price >= 0;
        const labourHeader = values.some(v => ['شرحاجرت', 'شرحعملیات'].includes(key(v)));
        const next: Section | null = priced && labourHeader ? 'labour' : priced && detected.quantity >= 0 ? 'replace' : cur.section === 'equivalent' ? 'equivalent' : priced ? cur.section : null;
        if (priced || cur.section === 'equivalent') {
          hadTable = true;
          if (!next) { error(rowNo, 'نوع جدول مشخص نیست؛ عنوان قطعات یا اجرت را مشخص کنید'); columns = null; continue; }
          // A header repeated on the next printed page keeps the running totals;
          // a different table structure replaces the column map.
          enter(next);
          columns = detected; closed = null;
          if (priced && values.some(v => v.includes('تومان')) && currency !== 'toman') error(rowNo, 'عنوان ستون تومان است؛ واحد مبلغ را تومان انتخاب کنید');
          if (priced && values.some(v => v.includes('ریال')) && currency !== 'rial') error(rowNo, 'عنوان ستون ریال است؛ واحد مبلغ را ریال انتخاب کنید');
          continue;
        }
      }
      // A printed continuation page repeats report metadata instead of table
      // headers. Keep the active columns across these page breaks.
      if (values.some((v, i) => key(v).startsWith(REPORT_TITLE) || (REPORT_LABELS.some(l => key(v).startsWith(l)) && (v.includes(':') || !columns || i !== columns.description)))) continue;

      const section = cur.section;
      if (!columns || !section) {
        // Never drop an item silently: rows that still fit the last table but
        // come after its total have no header of their own.
        if (closed && section) {
          const c = closed, d = values[c.description] ?? '', st = c.status >= 0 ? statusOf(values[c.status] ?? '') : 'blank';
          if (d && (values[c.code] ?? '') && st !== 'unknown' && st !== 'blank') error(rowNo, 'این ردیف پس از جمع جدول آمده و عنوان ستون ندارد؛ فایل را بررسی کنید');
        }
        continue;
      }
      const cols = columns;
      const cell = (k: Field) => cols[k] >= 0 ? values[cols[k]] ?? '' : '';
      const description = cell('description'), code = toLatinDigits(cell('code')).trim();
      const date = toLatinDigits(cell('date')).trim() || null, unit = cell('unit') || null;
      const statusText = cell('status'), status = cols.status >= 0 ? statusOf(statusText) : 'blank';

      if (!description && !code) {
        const amountCell = section === 'equivalent' ? '' : cell('amount');
        const total = numeric(amountCell);
        if (Number.isFinite(total)) {
          checkTotal(rowNo, section === 'replace' ? 'جمع قطعات' : 'جمع اجرت', total * multiplier, cur.rial, cur.review);
          declared[section === 'replace' ? 'parts' : 'labour'] = total * multiplier;
          closed = columns; columns = null;
        }
        continue;
      }
      if (!code && values.some(v => END_OF_TABLE.test(key(v)))) {
        const total = numeric(cell('amount'));
        if (section !== 'equivalent' && Number.isFinite(total)) checkTotal(rowNo, section === 'replace' ? 'جمع قطعات' : 'جمع اجرت', total * multiplier, cur.rial, cur.review, false);
        closed = columns; columns = null; continue;
      }

      if (section === 'equivalent') {
        const amount = numeric(cell('amount'));
        const bucket = status === 'blank' ? 'unknown' : status;
        s.equivalents[bucket]++;
        result.equivalents.push({ ...at(rowNo), status, statusText, description, code: code || null, date, amountRial: Number.isFinite(amount) ? amount * multiplier : null });
        if (status === 'unknown' || status === 'blank') result.warnings.push({ ...at(rowNo), message: `وضعیت اجرت معادل «${description}» مشخص نیست؛ در سامانه رسمی بررسی کنید` });
        const identity = `${key(description)}|${code.toUpperCase()}`;
        if (seenEquivalent.has(identity)) result.warnings.push({ ...at(rowNo), message: `اجرت معادل «${description}» تکراری است؛ تکرار احتمالی صفحه را بررسی کنید` });
        seenEquivalent.add(identity);
        if (date) dates.add(date);
        continue;
      }

      const kind = section === 'replace' ? 'part' as const : 'labour' as const;
      const tally = section === 'replace' ? s.parts : s.labour;
      if (status === 'rejected' || status === 'correction') {
        tally[status]++;
        if (status === 'correction') { cur.review = true; sheetReview = true; }
        const quantity = section === 'labour' ? 1 : numeric(cell('quantity'));
        const amount = numeric(cell('amount')), price = numeric(cell('price'));
        const amountRial = Number.isFinite(amount) ? amount * multiplier : Number.isFinite(price) && Number.isFinite(quantity) ? price * quantity * multiplier : null;
        result.setAside.push({
          ...at(rowNo), kind, status, statusText, description, code: code || null, quantity: Number.isFinite(quantity) ? quantity : null, amountRial, date,
          reason: status === 'rejected' ? 'ردشده؛ برای سابقه نمایش داده می‌شود و به اقلام فعال یا تأمین اضافه نمی‌شود' : 'درخواست اصلاح؛ تا تعیین تکلیف وارد پیش‌نویس نمی‌شود',
        });
        if (date) dates.add(date);
        continue;
      }
      if (status === 'unknown') { tally.unknown++; error(rowNo, `وضعیت «${statusText}» شناخته نشد؛ پیش از ورود بررسی کنید`); continue; }
      if (status === 'blank' && cols.status >= 0) { tally.unknown++; error(rowNo, 'وضعیت ردیف خالی است؛ فقط ردیف نهایی وارد می‌شود'); continue; }

      const quantity = section === 'labour' ? 1 : numeric(cell('quantity'));
      if (section === 'replace' && !cell('price') && !cell('amount')) { error(rowNo, 'مبلغ و فی خالی‌اند؛ قیمت صفر فرض نمی‌شود'); continue; }
      const amount = cell('amount') ? numeric(cell('amount')) : null;
      const price = section === 'labour' ? 0 : cell('price') ? numeric(cell('price')) : amount === null ? 0 : amount / quantity;
      const evidence = ['اکسل', `برگه ${sheet.name}`, page ? `صفحه ${page}` : '', `ردیف ${rowNo}`, date ? `تاریخ ${date}` : '', unit ? `واحد ${unit}` : '',
        // The labour code stays last: assessmentPartKey reads it from the end.
        section === 'labour' && code ? `کد اجرت ${code}` : ''].filter(Boolean).join('، ');
      const candidate = {
        ...at(rowNo), action: section === 'labour' ? 'repair' as const : 'replace' as const, description,
        partNumber: section === 'replace' ? code || null : null,
        quantity, unitPriceRial: price * multiplier,
        labourRial: section === 'labour' ? (amount ?? NaN) * multiplier : 0,
        evidence, date, unit,
      };
      const validated = assessmentItemSchema.safeParse({ ...candidate, expectedVersion: 1 });
      if (!validated.success || (amount !== null && (!Number.isFinite(amount) || (section === 'replace' && Math.abs(quantity * price - amount) > 0.01)))) {
        error(rowNo, 'شرح، تعداد یا مبلغ معتبر نیست یا مبلغ با تعداد × فی همخوانی ندارد'); continue;
      }
      const identity = section === 'replace' ? assessmentPartKey(candidate) : JSON.stringify([section, key(description), key(code)]);
      if (seen.has(identity)) { error(rowNo, 'قلم تکراری است؛ تکرار احتمالی صفحه را بررسی کنید'); continue; }
      seen.add(identity); result.rows.push(candidate); tally.final++;
      if (date) dates.add(date);
      const rialValue = section === 'replace' ? candidate.quantity * candidate.unitPriceRial : candidate.labourRial;
      cur.rial += rialValue;
      if (section === 'replace') { sheetParts += rialValue; s.partsRial += rialValue; } else { sheetLabour += rialValue; s.labourRial += rialValue; }
      if (result.rows.length > 500) { error(rowNo, 'حداکثر ۵۰۰ قلم را در یک فایل وارد کنید'); return result; }
    }
    pages += sheetPages;
    if (declared.parts !== null) s.declared.partsRial = (s.declared.partsRial ?? 0) + declared.parts;
    if (declared.labour !== null) s.declared.labourRial = (s.declared.labourRial ?? 0) + declared.labour;
    if (!hadTable && sheet.rows.some(r => r.some(v => v.trim())) && sheets.length > 1) {
      result.skipped.push({ sheet: sheet.name, row: 0, page: null, reason: `برگه «${sheet.name}» جدول قطعه یا اجرت ندارد و خوانده نشد` });
    }
  }
  s.pages = anyPage ? pages : null;
  s.totalRial = s.partsRial + s.labourRial;
  s.dates = [...dates].sort();
  if (!result.rows.length && !result.errors.length) result.errors.push({ sheet: '', row: 0, page: null, message: 'جدول قطعات یا اجرت قابل ورود پیدا نشد؛ عنوان ستون‌ها را بررسی کنید' });
  return result;
}
