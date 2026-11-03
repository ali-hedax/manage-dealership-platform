import { normalizePersian, parseBasePartNumber, parseDecimal, parseStockCode, toLatinDigits } from '@manage/shared';

// Pure parsing of the two daily reports into normalized rows with an
// outcome. No database. Customer data of the Emdad report (owner name, mobile,
// plate, engine number, vehicle description, golden-card validity) is never
// copied into the result.

export const PARSER_VERSION = 'daily-reports/1';

export type RowOutcome = 'valid' | 'new' | 'changed' | 'unchanged' | 'needs_mapping' | 'duplicate' | 'invalid' | 'ambiguous' | 'total_row';
export interface ParsedRow<T> {
  rowNo: number;
  outcome: RowOutcome;
  key: string | null;
  data: T;
  messages: string[];
}

const hkey = (s: string) => normalizePersian(s).replace(/\s+/g, '');
const findHeader = (rows: string[][], required: string[], scan = 20) => {
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const keys = (rows[i] ?? []).map((c) => hkey(c ?? ''));
    if (required.every((r) => keys.includes(hkey(r)))) return i;
  }
  return -1;
};
export const headerSignature = (header: string[]) => header.map((h) => hkey(h ?? '')).filter(Boolean).join('|');

// ------------------------------------------------------------------- stock

export interface StockRowData {
  rawCode: string;
  fullStockCode: string;
  basePartNumber: string | null;
  supplySuffix: string | null;
  codeKind: 'standard' | 'needs_mapping';
  description: string | null;
  unit: string | null;
  vehicleModel: string | null;
  quantity: string;
  avgPrice: string | null;
  salePrice: string | null;
  locationAddress: string;
  locationText: string | null;
  baseStatus: string | null;
}

const STOCK_COLS = { code: 'کد کالا', desc: 'شرح کالا', unit: 'واحد شمارش', model: 'مدل خودرو', qty: 'موجودي', avg: 'قيمت ميانگين', sale: 'قيمت فروش', addr: 'آدرس', loc: 'شرح لوکيشن', base: 'وضعيت مبنا' };

export function parseStockSheet(rows: string[][]) {
  const h = findHeader(rows, [STOCK_COLS.code, STOCK_COLS.qty]);
  if (h < 0) throw new Error('سربرگ گزارش موجودی (ستون‌های «کد کالا» و «موجودي») پیدا نشد');
  const header = rows[h]!;
  const at = (name: string) => header.findIndex((c) => hkey(c ?? '') === hkey(name));
  const idx = Object.fromEntries(Object.entries(STOCK_COLS).map(([k, v]) => [k, at(v)])) as Record<keyof typeof STOCK_COLS, number>;
  const missingColumns = (Object.keys(STOCK_COLS) as (keyof typeof STOCK_COLS)[]).filter((k) => idx[k] < 0);
  const get = (r: string[], k: keyof typeof STOCK_COLS) => (idx[k] < 0 ? '' : String(r[idx[k]] ?? '').trim());
  const out: ParsedRow<StockRowData>[] = [];
  const blank: number[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (!r.some((c) => String(c ?? '').trim())) {
      blank.push(i + 1);
      continue;
    }
    const messages: string[] = [];
    const code = parseStockCode(get(r, 'code'));
    const quantity = parseDecimal(get(r, 'qty'));
    const avg = get(r, 'avg') ? parseDecimal(get(r, 'avg')) : null;
    const sale = get(r, 'sale') ? parseDecimal(get(r, 'sale')) : null;
    let outcome: RowOutcome = 'valid';
    if (!code) {
      outcome = 'invalid';
      messages.push('کد کالا خالی است');
    }
    if (quantity === null) {
      outcome = 'invalid';
      messages.push(`موجودی «${get(r, 'qty')}» عدد نامنفی معتبر نیست`);
    }
    if ((get(r, 'avg') && avg === null) || (get(r, 'sale') && sale === null)) {
      outcome = 'invalid';
      messages.push('قیمت میانگین یا فروش عدد معتبر نیست');
    }
    if (outcome === 'valid' && code!.kind === 'needs_mapping') {
      outcome = 'needs_mapping';
      messages.push('کد کالا قالب استاندارد ۱۰رقمی ندارد؛ مستقل و «نیازمند تطبیق کد» نگه داشته می‌شود');
    }
    const data: StockRowData = {
      rawCode: get(r, 'code'),
      fullStockCode: code?.fullStockCode ?? '',
      basePartNumber: code?.basePartNumber ?? null,
      supplySuffix: code?.supplySuffix ?? null,
      codeKind: code?.kind ?? 'needs_mapping',
      description: get(r, 'desc') || null,
      unit: get(r, 'unit') || null,
      vehicleModel: get(r, 'model') || null,
      quantity: quantity ?? '0',
      avgPrice: avg,
      salePrice: sale,
      locationAddress: get(r, 'addr'),
      locationText: get(r, 'loc') || null,
      baseStatus: get(r, 'base') || null,
    };
    out.push({ rowNo: i + 1, outcome, key: code ? `${code.fullStockCode}@${data.locationAddress}` : null, data, messages });
  }
  // The same code in the same location twice: both stay for review, none is summed.
  const seen = new Map<string, ParsedRow<StockRowData>[]>();
  for (const p of out) if (p.key && p.outcome !== 'invalid') seen.set(p.key, [...(seen.get(p.key) ?? []), p]);
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    for (const p of group) {
      p.outcome = 'duplicate';
      p.messages.push(`همین کد در همین محل در ردیف‌های ${group.map((g) => g.rowNo).join('، ')} آمده است؛ جمع نمی‌شود`);
    }
  }
  return { headerRow: h + 1, header, signature: headerSignature(header), missingColumns, rows: out, blankRows: blank };
}

// ------------------------------------------------------------------- emdad

/** Columns kept from the Emdad report (no owner name, phone, plate, engine number, vehicle description). */
export const EMDAD_FIELDS = {
  admissionNo: 'شماره کارت پذيرش',
  admissionDate: 'تاريخ پذيرش',
  chassis: 'شماره شاسی',
  emdadRegisteredAt: 'تاریخ ثبت امداد ویژه',
  emdadNo: 'شماره امداد ویژه',
  fullCode: 'كد تداركاتي كالا',
  specialDescription: 'شرح اختصاصی',
  specialQuantity: 'تعداد اختصاصي',
  sendStatus: 'وضعيت ارسال درخواست به امداد ويژه',
  cancelReason: 'دلائل ابطال امداد ویژه',
  cancelledAt: 'تاریخ و زمان ابطال امداد ویژه',
  receivedInWarehouseAt: 'تاريخ رسيد شدن امداد ويژه در انبار',
  cardStatus: 'وضعیت کارت',
  hall: 'سالن تعمیرات',
  goldenCardStatus: 'وضعیت کارت طلایی',
  waitingTime: 'زمان انتظار امداد ویژه',
  requestNo: 'شماره درخواست',
  initialCode: 'کد اختصاصی اولیه',
  partCode: 'کد قطعه',
  supplyDescription: 'شرح تدارکاتی',
  supplyQuantity: 'تعداد تداركاتي',
  emdadStatus: 'وضعیت امداد ویژه',
  sendMethod: 'نحوه ارسال قطعه',
  exitedAt: 'تاریخ و زمان خروج قطعه',
  admissionToReleaseDays: 'پذیرش تا ترخیص (روز)',
  releasedAt: 'تاريخ ترخيص',
  invoiceNo: 'شماره فاکتور',
  stopReason: 'علت توقف',
  warrantyStatus: 'وضعیت گارانتی',
} as const;
export type EmdadField = keyof typeof EMDAD_FIELDS;
export type EmdadOfficial = Record<EmdadField, string> & {
  fullCodeKind: 'standard' | 'needs_mapping' | 'missing';
  fullCodeBase: string | null;
  codeNotes: string[];
};

// Display categories of the official supply status (mapping v1). The source
// text is always kept; an unknown text is shown as "needs interpretation".
export const EMDAD_STATUS_MAP_VERSION = 1;
const EMDAD_STATUS_CATEGORY: Record<string, string> = {
  'وارد موجودی شده است': 'in_dealer_stock',
  ابطال: 'cancelled',
  'رسید توسط نمایندگی': 'received_by_dealer',
  'تامین توسط نمایندگی': 'supplied_by_dealer',
  'در حال تامین': 'in_supply',
  'آماده جمع آوری': 'ready_to_collect',
  '**پیش نویس قطعه': 'draft',
  'آماده صدور فاکتور': 'invoice_ready',
  'فاکتور ایساکو صادر شده است': 'invoiced',
  '**دفتر منطقه ای': 'regional_office',
};
export function emdadStatusCategory(raw: string): string {
  return EMDAD_STATUS_CATEGORY[normalizePersian(raw)] ?? EMDAD_STATUS_CATEGORY[raw.trim()] ?? (raw.trim() ? 'needs_interpretation' : 'missing');
}

const idPart = (s: string) => toLatinDigits(s).replace(/\s+/g, '').toUpperCase();
/** Stable key candidate: admission + chassis + Emdad number + request number + initial code. */
export function emdadKey(o: Pick<EmdadOfficial, 'admissionNo' | 'chassis' | 'emdadNo' | 'requestNo' | 'initialCode'>): string | null {
  const parts = [o.admissionNo, o.chassis, o.emdadNo, o.requestNo, o.initialCode].map(idPart);
  return parts.slice(0, 4).every(Boolean) ? parts.join('|') : null;
}

export function parseEmdadSheet(rows: string[][]) {
  const h = findHeader(rows, [EMDAD_FIELDS.admissionNo, EMDAD_FIELDS.emdadNo, EMDAD_FIELDS.requestNo]);
  if (h < 0) throw new Error('سربرگ گزارش امداد ویژه (پذیرش، شماره امداد، شماره درخواست) پیدا نشد');
  const header = rows[h]!;
  const idx = Object.fromEntries(
    Object.entries(EMDAD_FIELDS).map(([k, v]) => [k, header.findIndex((c) => hkey(c ?? '') === hkey(v))]),
  ) as Record<EmdadField, number>;
  const missingCols = (Object.keys(EMDAD_FIELDS) as EmdadField[]).filter((k) => idx[k] < 0);
  const out: ParsedRow<EmdadOfficial>[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (!r.some((c) => String(c ?? '').trim())) continue;
    const get = (k: EmdadField) => (idx[k] < 0 ? '' : String(r[idx[k]] ?? '').trim());
    const official = Object.fromEntries((Object.keys(EMDAD_FIELDS) as EmdadField[]).map((k) => [k, get(k)])) as unknown as EmdadOfficial;
    // Totals row: no admission, chassis, Emdad or request number; only sums.
    if (!official.admissionNo && !official.chassis && !official.emdadNo && !official.requestNo) {
      out.push({ rowNo: i + 1, outcome: 'total_row', key: null, data: { ...official, fullCodeKind: 'missing', fullCodeBase: null, codeNotes: [] }, messages: ['ردیف جمع گزارش است، نه درخواست قطعه؛ وارد نشد'] });
      continue;
    }
    const messages: string[] = [];
    const full = parseStockCode(official.fullCode);
    const part = parseBasePartNumber(official.partCode);
    const initial = parseBasePartNumber(official.initialCode);
    official.fullCodeKind = !full ? 'missing' : full.kind;
    official.fullCodeBase = full?.basePartNumber ?? null;
    official.codeNotes = [];
    if (!full) official.codeNotes.push('کد کامل تدارکاتی خالی است');
    else if (full.basePartNumber && part && full.basePartNumber !== part) official.codeNotes.push('پایه کد کامل با «کد قطعه» فرق دارد (ممکن است تغییر کد یا تأمین جایگزین باشد؛ تفسیر نشده)');
    if (initial && part && initial !== part) official.codeNotes.push('«کد اختصاصی اولیه» با «کد قطعه» فرق دارد (تفسیر نشده)');
    if (official.fullCode) official.fullCode = full?.fullStockCode ?? official.fullCode;
    const key = emdadKey(official);
    let outcome: RowOutcome = 'valid';
    if (!key) {
      outcome = 'ambiguous';
      messages.push('شناسه کامل ندارد (پذیرش، شاسی، شماره امداد یا شماره درخواست خالی است)؛ برای بررسی نگه داشته شد');
    }
    if (emdadStatusCategory(official.emdadStatus) === 'needs_interpretation') messages.push(`وضعیت «${official.emdadStatus}» شناخته‌شده نیست؛ متن اصلی نگه داشته شد (نیازمند تفسیر وضعیت)`);
    out.push({ rowNo: i + 1, outcome, key, data: official, messages: [...messages, ...official.codeNotes] });
  }
  const seen = new Map<string, ParsedRow<EmdadOfficial>[]>();
  for (const p of out) if (p.key) seen.set(p.key, [...(seen.get(p.key) ?? []), p]);
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    for (const p of group) {
      p.outcome = 'duplicate';
      p.messages.push(`شناسه یکسان در ردیف‌های ${group.map((g) => g.rowNo).join('، ')}؛ هیچ‌کدام خودکار جایگزین دیگری نمی‌شود`);
    }
  }
  return { headerRow: h + 1, header, signature: headerSignature(header), missingColumns: missingCols, rows: out };
}
