import { assessmentItemSchema, assessmentPartKey, normalizePersian, toLatinDigits, type AssessmentImportPreview } from '@manage/shared';
import { readWorkbook, XlsxError } from '../parts/xlsx';

const key = (s: string) => normalizePersian(toLatinDigits(s)).replace(/[\s\u200c:()«»]/g, '').trim();
const numeric = (s: string) => {
  const value = toLatinDigits(s).replace(/[,،٬\s]/g, '');
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
};
const aliases = {
  description: ['شرح', 'شرح قطعه', 'نام قطعه', 'شرح اجرت', 'شرح عملیات'],
  code: ['کد', 'شماره فنی', 'کد فنی', 'شماره قطعه', 'کد کالا'],
  quantity: ['تعداد'], price: ['فی', 'فی ریال', 'فی تومان', 'قیمت واحد', 'قیمت واحد ریال', 'قیمت واحد تومان'],
  amount: ['مبلغ', 'مبلغ کل', 'جمع مبلغ', 'مبلغ ریال', 'مبلغ تومان'], status: ['وضعیت'],
};
type Columns = Record<keyof typeof aliases, number>;

/** Read only structural table headers, never infer identity or official approval. */
export function parseAssessmentSheet(data: Uint8Array, currency: 'rial' | 'toman'): AssessmentImportPreview {
  const result: AssessmentImportPreview = { rows: [], errors: [], skipped: [], applied: false };
  const error = (sheet: string, row: number, message: string) => result.errors.push({ sheet, row, message });
  let sheets;
  try { sheets = readWorkbook(data); }
  catch (e) { error('', 0, e instanceof XlsxError ? e.message : 'فایل خوانده نشد'); return result; }
  const seen = new Set<string>();
  for (const sheet of sheets) {
    let columns: Columns | null = null;
    let section: 'replace' | 'labour' | 'excluded' | null = null;
    for (const [index, row] of sheet.rows.entries()) {
      const rowNo = index + 1;
      const values = row.map(v => v.trim());
      const nonempty = values.filter(Boolean);
      if (!nonempty.length) continue;
      if (nonempty.some(v => key(v) === key('اجرت های معادل'))) {
        section = 'excluded'; columns = null;
        result.skipped.push({ sheet: sheet.name, row: rowNo, reason: 'بخش اجرت‌های معادل برای جلوگیری از محاسبه دوباره وارد نمی‌شود' });
        continue;
      }
      if (nonempty.length === 1 && ['قطعات', 'اجرت', 'اجرتها'].includes(key(nonempty[0]!))) {
        section = key(nonempty[0]!) === 'قطعات' ? 'replace' : 'labour'; columns = null; continue;
      }
      const detected = Object.fromEntries(Object.entries(aliases).map(([k, names]) => [k, values.findIndex(v => names.some(n => key(n) === key(v)))])) as Columns;
      if (detected.description >= 0 && detected.code >= 0 && (detected.amount >= 0 || detected.price >= 0 || section === 'excluded')) {
        if (section === 'excluded') { columns = detected; continue; }
        section = values.some(v => ['شرحاجرت','شرحعملیات'].includes(key(v))) ? 'labour' : detected.quantity >= 0 ? 'replace' : section;
        if (!section) { error(sheet.name, rowNo, 'نوع جدول مشخص نیست؛ عنوان قطعات یا اجرت را مشخص کنید'); columns = null; }
        else columns = detected;
        if (values.some(v => v.includes('تومان')) && currency !== 'toman') error(sheet.name, rowNo, 'عنوان ستون تومان است؛ واحد مبلغ را تومان انتخاب کنید');
        if (values.some(v => v.includes('ریال')) && currency !== 'rial') error(sheet.name, rowNo, 'عنوان ستون ریال است؛ واحد مبلغ را ریال انتخاب کنید');
        continue;
      }
      // A printed continuation page repeats report metadata instead of table headers.
      // Keep the active columns across these page breaks; do not treat metadata as rows.
      if (nonempty.some(v => /(?:زمان چاپ|شماره دستور کار|شماره رخداد|شماره شاسی|شماره خودرو|تاریخ دریافت دستور کار|شرح خودرو|نام و نام خانوادگی کارشناس|شماره کارت تعمیراتی|توضیحات کارشناس|مدت زمان تعمیرات|فرانشیز|کیلومتر|نوع دستور کار|لیست قطعات و اجرت|سقف خسارت|مبلغ اجرت خسارتی|جمع مبلغ قطعه و اجرت)/.test(v)) ||
          (values[3]?.includes('صفحه') && values[1]?.includes('از'))) continue;
      if (!columns || !section) continue;
      const cell = (k: keyof Columns) => columns![k] >= 0 ? values[columns![k]] ?? '' : '';
      const description = cell('description'), code = cell('code');
      if (section === 'excluded') {
        if (description && code && ['نهایی','رد'].includes(key(cell('status')))) result.skipped.push({sheet:sheet.name,row:rowNo,reason:`اجرت معادل ${description} (کد ${toLatinDigits(code)})؛ وضعیت ${cell('status')}؛ مبلغ مستقل ندارد و برای جلوگیری از محاسبه دوباره به جمع اضافه نمی‌شود`});
        continue;
      }
      if (nonempty.some(v => /^(جمع|مجموع|لیستقطعات|توضیحات|امضا)/.test(key(v)))) { columns = null; continue; }
      if (!description && !code) {
        // A printed page footer is not an item. A subsequent table must supply its own headers.
        columns = null; continue;
      }
      const status = key(cell('status'));
      if (['درخواستاصلاح', 'نیازمنداصلاح'].includes(status)) {
        result.skipped.push({sheet:sheet.name,row:rowNo,reason:'درخواست اصلاح؛ تا تعیین تکلیف وارد پیش‌نویس نمی‌شود'}); continue;
      }
      if (['رد', 'ردشده', 'ابطال', 'باطل', 'حذف', 'لغو'].includes(status)) {
        result.skipped.push({ sheet: sheet.name, row: rowNo, reason: 'ردیف ردشده یا لغوشده' }); continue;
      }
      if (status && !['نهایی', 'تایید', 'تاییدشده', 'تأیید', 'تأییدشده', 'مصوب', 'قطعی'].includes(status)) {
        error(sheet.name, rowNo, 'وضعیت ردیف شناخته نشد؛ پیش از ورود بررسی کنید'); continue;
      }
      const quantity = section === 'labour' ? 1 : numeric(cell('quantity'));
      if (section === 'replace' && !cell('price') && !cell('amount')) {
        error(sheet.name, rowNo, 'مبلغ و فی خالی‌اند؛ قیمت صفر فرض نمی‌شود'); continue;
      }
      const amount = cell('amount') ? numeric(cell('amount')) : null;
      const price = section === 'labour' ? 0 : cell('price') ? numeric(cell('price')) : amount === null ? 0 : amount / quantity;
      const multiplier = currency === 'toman' ? 10 : 1;
      // Preserve the per-item Jalali source date in audit evidence (part: T, labour: P).
      const sourceDate = toLatinDigits(values[section === 'replace' ? 19 : 15] ?? '').trim();
      const candidate = {
        sheet: sheet.name, row: rowNo, action: section === 'labour' ? 'repair' as const : 'replace' as const, description,
        partNumber: section === 'replace' ? toLatinDigits(code).trim() || null : null,
        quantity, unitPriceRial: price * multiplier,
        labourRial: section === 'labour' ? (amount ?? NaN) * multiplier : 0,
        evidence: `اکسل، برگه ${sheet.name}، ردیف ${rowNo}${sourceDate ? `، تاریخ ${sourceDate}` : ''}${section === 'labour' && code ? `، کد اجرت ${toLatinDigits(code)}` : ''}`,
      };
      const validated = assessmentItemSchema.safeParse({ ...candidate, expectedVersion: 1 });
      if (!validated.success || (amount !== null && (!Number.isFinite(amount) || (section === 'replace' && Math.abs(quantity * price - amount) > 0.01)))) {
        error(sheet.name, rowNo, 'شرح، تعداد یا مبلغ معتبر نیست یا مبلغ با تعداد × فی همخوانی ندارد'); continue;
      }
      const identity = section === 'replace' ? assessmentPartKey(candidate) : JSON.stringify([section, key(description), key(code)]);
      if (seen.has(identity)) { error(sheet.name, rowNo, 'قلم تکراری است؛ تکرار احتمالی صفحه را بررسی کنید'); continue; }
      seen.add(identity); result.rows.push(candidate);
      if (result.rows.length > 500) { error(sheet.name, rowNo, 'حداکثر ۵۰۰ قلم را در یک فایل وارد کنید'); return result; }
    }
  }
  if (!result.rows.length && !result.errors.length) error('', 0, 'جدول قطعات یا اجرت قابل ورود پیدا نشد؛ عنوان ستون‌ها را بررسی کنید');
  return result;
}
