import { z } from 'zod';

// «منبع‌ها» (data foundation, S07 + S08, owner 2026-11-28): one page for the system administrator with
// every report Manage reads from کسب‌وکار — when it was last read, automatically by Pulse or by hand,
// how many rows, whether it failed — and, when Pulse is down, the step-by-step way to get the same
// report by hand. Nothing here guesses a column of کسب‌وکار: fields whose column name was never seen
// in a recording are confirmed once by the administrator from the column names Pulse observed.

export const DATA_SOURCE_KEYS = ['cards', 'lines', 'stock', 'emdad', 'appointments', 'stoppages'] as const;
export type DataSourceKey = (typeof DATA_SOURCE_KEYS)[number];
export type DataSourceMode = 'auto' | 'manual';

export interface DataSourceDefinition {
  title: string;
  /** Where the same report is in کسب‌وکار (for the manual fallback). */
  isacoPath: string;
  /** How Manage receives it. */
  modes: readonly DataSourceMode[];
  /** Expected rhythm, in words. */
  rhythm: string;
  /** Older than this many minutes (in working hours, or working days for daily reports) is «کهنه». */
  staleAfterMinutes: number;
  /** Step-by-step manual fallback when Pulse is down. */
  guide: readonly string[];
  /** Page of Manage where the file is uploaded by hand (null: automatic only). */
  manualHref: string | null;
}

export const DATA_SOURCES: Record<DataSourceKey, DataSourceDefinition> = {
  cards: {
    title: 'پذیرش‌ها (کارت تعمیرات)',
    isacoPath: 'خدمات ← عملیات ← تعمیرات خودرو',
    modes: ['auto', 'manual'],
    rhythm: 'پالس هر چند دقیقه در ساعات کاری',
    staleAfterMinutes: 20,
    guide: [
      'در کسب‌وکار (b2b.isaco.ir) مسیر «خدمات ← عملیات ← تعمیرات خودرو» را باز کنید.',
      'بازهٔ «تاریخ پذیرش» را از روزی که پالس قطع شد تا امروز بگذارید و «جستجو» را بزنید.',
      'قالب «پذیرش و ریز کارت» منیج را از همین صفحه دریافت کنید؛ برای هر کارت یک ردیف با شمارهٔ پذیرش، شاسی، نام خودرو، مشتری، پذیرشگر، تاریخ پذیرش و اگر ترخیص شده تاریخ ترخیص بنویسید (یا ستون‌های هم‌نام را از خروجی Excel کسب‌وکار کپی کنید).',
      'فایل را در «بارگذاری دستی پذیرش و ریز کارت» همین صفحه بیندازید، پیش‌نمایش را ببینید و «ثبت» را بزنید.',
      'بارگذاری دوبارهٔ همان فایل یا فایلی با همان شمارهٔ پذیرش چیز تکراری نمی‌سازد؛ کلید هر ردیف شمارهٔ پذیرش است. وقتی پالس برگشت، همان کارت‌ها را از کسب‌وکار به‌روز می‌کند.',
    ],
    manualHref: '/settings/sources#manual-reception',
  },
  lines: {
    title: 'ریز کارت: اجرت‌ها و قطعه‌های مصرفی',
    isacoPath: 'خدمات ← عملیات ← تعمیرات خودرو ← جزئیات کارت',
    modes: ['auto', 'manual'],
    rhythm: 'پالس: کارت تازه بی‌درنگ، کارت باز امروز هر ۱۰ دقیقه، کارت باز قدیمی هر ۳۰ دقیقه',
    staleAfterMinutes: 60,
    guide: [
      'در کسب‌وکار کارت را از «خدمات ← عملیات ← تعمیرات خودرو» باز کنید و «جزئیات کارت» را ببینید.',
      'در قالب «پذیرش و ریز کارت» منیج، برای هر اجرت یک ردیف با «نوع ردیف = اجرت»، شمارهٔ پذیرش، کد و نام اجرت، تعمیرکار و جایگاه بنویسید.',
      'برای هر قطعهٔ مصرفی یک ردیف با «نوع ردیف = قطعه»، شمارهٔ پذیرش، کد فنی، نام، تعداد و مبلغ (ریال) بنویسید.',
      'فایل را در «بارگذاری دستی پذیرش و ریز کارت» بیندازید و پس از پیش‌نمایش «ثبت» را بزنید. ردیف‌های دستی هر کارت با فایل بعدی جایگزین می‌شوند و وقتی پالس همان کارت را خواند، جای خود را به دادهٔ پالس می‌دهند.',
    ],
    manualHref: '/settings/sources#manual-reception',
  },
  stock: {
    title: 'موجودی انبار',
    isacoPath: 'گزارش موجودی انبار (جست‌وجو: «موجودی انبار»)',
    modes: ['auto', 'manual'],
    rhythm: 'پالس روزی یک بار از ساعت ۱۰',
    staleAfterMinutes: 24 * 60,
    guide: [
      'در کسب‌وکار صفحهٔ «گزارش موجودی انبار» را باز کنید (جست‌وجوی بالای صفحه: «موجودی انبار»).',
      'سال جاری و «انبار قطعات و لوازم یدکی» را انتخاب کنید؛ بقیهٔ صافی‌ها خالی بماند.',
      'فایل xls را دریافت کنید و آن را باز یا ویرایش نکنید.',
      'در منیج «گزارش‌های روزانه ← موجودی» فایل را بیندازید، پیش‌نمایش را ببینید و تأیید کنید.',
    ],
    manualHref: '/daily-reports?kind=stock',
  },
  emdad: {
    title: 'گزارش امداد ویژه',
    isacoPath: 'خدمات ← گزارش ← امداد ویژه',
    modes: ['auto', 'manual'],
    rhythm: 'پالس روزی یک بار از ساعت ۱۰:۰۵ (نه ۱۶ تا ۱۸)',
    staleAfterMinutes: 24 * 60,
    guide: [
      'در کسب‌وکار مسیر «خدمات ← گزارش ← امداد ویژه» را باز کنید.',
      'بازهٔ تاریخ را از پنج ماه گذشته تا امروز بگذارید؛ صافی‌های دیگر را تغییر ندهید.',
      'خروجی Excel بگیرید و بدون باز کردن و ذخیرهٔ دوباره نگه دارید.',
      'در منیج «گزارش‌های روزانه ← امداد ویژه» فایل را بیندازید و پس از پیش‌نمایش «ثبت گزارش» را بزنید.',
    ],
    manualHref: '/daily-reports?kind=emdad',
  },
  appointments: {
    title: 'لیست نوبت پذیرش',
    isacoPath: 'خدمات ← گزارش ← پذیرش تا ترخیص ← لیست نوبت پذیرش',
    modes: ['auto', 'manual'],
    rhythm: 'پالس روزی یک بار از ساعت ۱۰:۱۰',
    staleAfterMinutes: 3 * 24 * 60,
    guide: [
      'در کسب‌وکار مسیر «خدمات ← گزارش ← پذیرش تا ترخیص ← لیست نوبت پذیرش» را باز کنید.',
      'بازه را از ۳۰ روز گذشته تا ۳۰ روز آینده بگذارید و خروجی Excel بگیرید.',
      'در منیج «اطلاعات پایه ← نوبت‌های پذیرش ایساکو» فایل را بیندازید و «ثبت» را بزنید.',
    ],
    manualHref: '/reference-data?kind=appointments',
  },
  stoppages: {
    title: 'گزارش توقف خودرو',
    isacoPath: 'بازرگانی ← گزارش ← گزارشات انبار ← گزارش توقف خودرو',
    modes: ['manual'],
    rhythm: 'دستی، هر روز کاری',
    staleAfterMinutes: 2 * 24 * 60,
    guide: [
      'در کسب‌وکار مسیر «بازرگانی ← گزارش ← گزارشات انبار ← گزارش توقف خودرو» را باز کنید.',
      'بازه را از یک ماه گذشته تا امروز بگذارید و خروجی Excel بگیرید؛ فایل را ویرایش نکنید.',
      'در منیج «خودروهای متوقف ← بارگذاری گزارش توقف خودرو» فایل را بیندازید، پیش‌نمایش را ببینید و تأیید کنید.',
    ],
    manualHref: '/reception/stoppage',
  },
};

/** One read of a source: by Pulse or by hand. */
export interface DataSourceRead {
  at: string;
  mode: DataSourceMode;
  /** Rows read (Pulse) or rows in the applied file (manual); null when unknown. */
  rows: number | null;
  ok: boolean;
  errorCode: string | null;
}

export interface DataSourceEntry extends DataSourceDefinition {
  key: DataSourceKey;
  /** Newest read of either kind, successful or not. */
  lastRead: DataSourceRead | null;
  /** Newest successful read of either kind. */
  lastSuccess: DataSourceRead | null;
  lastAuto: DataSourceRead | null;
  lastManual: DataSourceRead | null;
  /** No successful read within `staleAfterMinutes` (only judged when Pulse should be reading, or for manual sources). */
  stale: boolean;
  /** Not available to this person (no permission for the module): only the guide is shown. */
  restricted?: boolean;
}

// ------------------------------------------------------------ columns of کسب‌وکار (S08)

/**
 * Fields of the repair card whose column in کسب‌وکار was never seen in a recording. Until the
 * administrator confirms the column from the names Pulse observed, they stay empty (or, for the labour
 * and part names, keep the earlier columns) — never guessed. Values are then taken from the official
 * rows already stored, so a confirmation also fills every card read before it.
 */
export const KASB_FIELD_KEYS = ['repairName', 'repairTechnician', 'repairStation', 'partName', 'cardHall'] as const;
export type KasbFieldKey = (typeof KASB_FIELD_KEYS)[number];
export type KasbFieldList = 'cards' | 'repairs' | 'parts';
export const KASB_FIELD_DEFS: Record<KasbFieldKey, { label: string; list: KasbFieldList; hint: string }> = {
  repairName: { label: 'نام اجرت', list: 'repairs', hint: 'شرح اجرت؛ تا تأیید نشود از DrerDesc خوانده می‌شود (گاهی فقط کد است).' },
  repairTechnician: { label: 'تعمیرکار اجرت', list: 'repairs', hint: 'نام یا کد تعمیرکاری که اجرت را انجام داده است.' },
  repairStation: { label: 'جایگاه اجرت', list: 'repairs', hint: 'جایگاه تعمیراتی همان اجرت.' },
  partName: { label: 'نام قطعه', list: 'parts', hint: 'شرح قطعهٔ مصرفی؛ تا تأیید نشود از چند نام احتمالی خوانده می‌شود و اغلب خالی است.' },
  cardHall: { label: 'سالن تعمیرات کارت', list: 'cards', hint: 'سرویس سریع یا سالن تعمیرات؛ برای آمار سرویس سریع.' },
};
export const KASB_FIELD_LIST_LABELS: Record<KasbFieldList, string> = { cards: 'فهرست پذیرش (Drcds)', repairs: 'اجرت‌های کارت (Drers)', parts: 'قطعه‌های کارت (Dreps)' };

/** Administrator-confirmed column names (null or missing: not confirmed). */
export type KasbFieldMap = Partial<Record<KasbFieldKey, string | null>>;
const columnName = z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'نام ستون فقط حروف لاتین، رقم و _ است').nullable().optional();
export const kasbFieldMapSchema = z.object({
  repairName: columnName, repairTechnician: columnName, repairStation: columnName, partName: columnName, cardHall: columnName,
}).strict();
export type KasbFieldMapInput = z.infer<typeof kasbFieldMapSchema>;

/** How complete the stored repair-card data is (last 30 days), so a zero is never mistaken for a fact. */
export interface KasbFieldCoverage {
  since: string;
  receptions: number;
  receptionsWithLines: number;
  receptionsWithVin: number;
  receptionsWithVehicleName: number;
  receptionsWithHall: number;
  labourLines: number;
  labourWithName: number;
  labourWithTechnician: number;
  labourWithStation: number;
  partLines: number;
  partsWithName: number;
  partsWithCode: number;
  partsWithPrice: number;
}

export interface DataSourcesView {
  pulse: {
    configured: boolean;
    enabled: boolean;
    state: string;
    /** Pulse is expected to read now and does: false → the manual guides apply. */
    live: boolean;
    /** Why it is not live, in Persian (null when live). */
    reason: string | null;
    workerSeenAt: string | null;
    lastReadAt: string | null;
    withinWorkingHours: boolean;
  };
  sources: DataSourceEntry[];
  fieldMap: KasbFieldMap;
  /** Column names (never values) of the first non-empty answer of each list, as Pulse recorded them. */
  observedColumns: Record<KasbFieldList, string[]>;
  coverage: KasbFieldCoverage;
  /** Open cards whose own line read was refused last time (they are retried at their turn, never block others). */
  failedLineCards: number;
}

// ------------------------------------------------------------ manual upload «پذیرش و ریز کارت»

/** Fields of the manual «پذیرش و ریز کارت» file. The admission number is the key of every row. */
export const RECEPTION_IMPORT_FIELDS = [
  'admissionNo', 'rowType', 'chassis', 'vin', 'vehicleName', 'modelName', 'plate', 'customerName', 'customerMobile', 'receptionist',
  'admittedDate', 'admittedTime', 'status', 'releasedDate', 'releasedTime', 'hall',
  'code', 'name', 'technician', 'station', 'quantity', 'amountRial',
] as const;
export type ReceptionImportField = (typeof RECEPTION_IMPORT_FIELDS)[number];

/**
 * Header of each field in Manage's template (first name), and the other headers accepted for it: the
 * column names کسب‌وکار uses in its own API answers. A header that matches nothing is listed in the
 * preview as «خوانده نشد», never guessed.
 */
export const RECEPTION_IMPORT_HEADERS: Record<ReceptionImportField, readonly string[]> = {
  admissionNo: ['شماره پذیرش', 'DrcdDealerSeq'],
  rowType: ['نوع ردیف'],
  chassis: ['شاسی', 'DrcdGchsChs'],
  vin: ['VIN', 'GchsVin'],
  vehicleName: ['نام خودرو', 'GctpDesc'],
  modelName: ['مدل کامل', 'WvmdDes'],
  plate: ['پلاک'],
  customerName: ['نام مشتری', 'DrcdCustName'],
  customerMobile: ['موبایل مشتری', 'DrcdOwnerMob'],
  receptionist: ['پذیرشگر', 'NdRcptFullName'],
  admittedDate: ['تاریخ پذیرش', 'DrcdRcptDate'],
  admittedTime: ['ساعت پذیرش', 'DrcdRcptTime'],
  status: ['وضعیت پذیرش'],
  releasedDate: ['تاریخ ترخیص', 'DrcdExtDte'],
  releasedTime: ['ساعت ترخیص', 'DrcdExtTim'],
  hall: ['سالن تعمیرات'],
  code: ['کد'],
  name: ['نام'],
  technician: ['تعمیرکار'],
  station: ['جایگاه'],
  quantity: ['تعداد'],
  amountRial: ['مبلغ (ریال)', 'مبلغ'],
};
export const RECEPTION_IMPORT_ROW_TYPES = { card: 'کارت', labour: 'اجرت', part: 'قطعه' } as const;
export type ReceptionImportRowType = keyof typeof RECEPTION_IMPORT_ROW_TYPES;

export const receptionImportFileSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  fileBase64: z.string().min(4).max(8_000_000),
}).strict();
export type ReceptionImportFileInput = z.infer<typeof receptionImportFileSchema>;

export interface ReceptionImportCard {
  admissionNo: string;
  outcome: 'new' | 'update' | 'unchanged' | 'error';
  message: string | null;
  labour: number;
  parts: number;
}
export interface ReceptionImportPreview {
  id: string;
  fileName: string;
  status: 'preview' | 'applied';
  /** Headers matched to a field, and the ones nothing matched. */
  columns: { header: string; field: ReceptionImportField | null }[];
  cards: ReceptionImportCard[];
  /** Rows that could not be read (no admission number, unknown row type, bad date). */
  rowErrors: { rowNo: number; message: string }[];
  counts: { new: number; update: number; unchanged: number; error: number; labour: number; parts: number };
  createdAt: string;
  appliedAt: string | null;
}
