import { z } from 'zod';

// «مرکز گزارش‌های کسب‌وکار» (spec section 25), under system settings. One place for the three
// ISACO reports: menu path, default period, an editable Persian guide and the import status.
// The special-aid report keeps using the existing daily-report import; the reception history
// keeps the reference-data import. The appointment report has no verified column layout yet.

export const REPORT_CENTER_KINDS = ['emdad', 'reception', 'appointments'] as const;
export type ReportCenterKind = (typeof REPORT_CENTER_KINDS)[number];

export interface ReportCenterDefaults {
  title: string;
  isacoPath: string;
  period: string;
  pastDays: number;
  futureDays: number;
  uploadHref: string | null;
  guide: string;
}
export const REPORT_CENTER_DEFAULTS: Record<ReportCenterKind, ReportCenterDefaults> = {
  emdad: {
    title: 'گزارش امداد ویژه',
    isacoPath: 'خدمات ← گزارش ← امداد ویژه',
    period: 'پنج ماه گذشته تا امروز',
    pastDays: 150, futureDays: 0,
    uploadHref: '/daily-reports?kind=emdad',
    guide: '۱. در ایساکو مسیر «خدمات ← گزارش ← امداد ویژه» را باز کنید.\n۲. بازهٔ تاریخ را از پنج ماه گذشته تا امروز بگذارید؛ بقیهٔ صافی‌ها را تغییر ندهید.\n۳. خروجی Excel بگیرید و فایل را بدون ویرایش ذخیره کنید.\n۴. در منیج «بارگذاری گزارش امداد ویژه» را بزنید، پیش‌نمایش را ببینید و تأیید کنید.\nبارگذاری دوباره همان فایل چیز تکراری نمی‌سازد.',
  },
  reception: {
    title: 'سوابق پذیرش مشتری و خودرو',
    isacoPath: 'خدمات ← عملیات ← تعمیرات خودرو',
    period: 'روز قبل',
    pastDays: 1, futureDays: 0,
    uploadHref: '/reference-data',
    guide: '۱. در ایساکو مسیر «خدمات ← عملیات ← تعمیرات خودرو» را باز کنید.\n۲. بازهٔ تاریخ را روز قبل بگذارید.\n۳. خروجی را بگیرید و در «اطلاعات پایه ← سوابق پذیرش» بارگذاری کنید.\nسوابق قبلی حفظ می‌شوند و ردیف تکراری دوباره ثبت نمی‌شود.',
  },
  appointments: {
    title: 'لیست نوبت پذیرش',
    isacoPath: 'خدمات ← گزارش ← پذیرش تا ترخیص ← لیست نوبت پذیرش',
    period: '۳۰ روز گذشته تا ۳۰ روز آینده',
    pastDays: 30, futureDays: 30,
    uploadHref: null,
    guide: '۱. در ایساکو مسیر «خدمات ← گزارش ← پذیرش تا ترخیص ← لیست نوبت پذیرش» را باز کنید.\n۲. بازه را از ۳۰ روز گذشته تا ۳۰ روز آینده بگذارید (نوبت‌های آینده هم در گزارش هستند).\n۳. خروجی را ذخیره کنید.\nورود این گزارش پس از تأیید ستون‌های نخستین نمونهٔ واقعی فعال می‌شود.',
  },
};

export const reportCenterSaveSchema = z.object({
  kind: z.enum(REPORT_CENTER_KINDS),
  guide: z.string().trim().min(10).max(4000),
  pastDays: z.number().int().min(0).max(400),
  futureDays: z.number().int().min(0).max(90),
});
export type ReportCenterSaveInput = z.infer<typeof reportCenterSaveSchema>;

export interface ReportCenterEntry extends ReportCenterDefaults {
  kind: ReportCenterKind;
  /** Import into Manage exists for this report (false: waiting for a verified layout). */
  supported: boolean;
  lastImport: { fileName: string; reportAt: string | null; appliedAt: string; rows: number | null; errors: number | null } | null;
  /** Tehran days (YYYY-MM-DD) of the last two weeks whose expected report was not published. */
  missingDays: string[];
  updatedAt: string | null;
}
