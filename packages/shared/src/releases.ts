// Release metadata of Manage by HEDAX (owner, 2026-11-18).
//
// Every production release gets one Semantic Version (vMAJOR.MINOR.PATCH) and a
// complete Persian list of the user-visible changes that actually shipped in it.
// The list is reviewed in the pull request like code; CI checks its shape
// (unique, strictly increasing versions, at least one change per release).
//
// The running version is the first entry of RELEASES compiled into the build, so
// a restart never changes it and a rollback to an older image shows the older
// version automatically. The API records the first time each version started
// (app_releases) as its deployment time; re-running the same release does not
// create a new version. A release is added here only in the PR that ships it.

export interface ReleaseSection {
  title: string;
  items: string[];
}

export interface ReleaseNote {
  /** vMAJOR.MINOR.PATCH */
  version: string;
  /** Tehran calendar day of the production release (YYYY-MM-DD). */
  date: string;
  summary: string;
  sections: ReleaseSection[];
}

export const RELEASES: readonly ReleaseNote[] = [
  {
    version: 'v1.0.0',
    date: '2026-11-18',
    summary: 'نخستین نسخهٔ شماره‌دار منیج: استفادهٔ هم‌زمان از موجودی و امداد ویژه، شناسایی قطعات غیرشرکتی، اصلاح لغو رزرو، حذف و بازیابی پرونده، اصلاح شماره فنی، چک‌لیست‌های چاپی و اعلان نسخهٔ تازه.',
    sections: [
      {
        title: 'قطعات و انبار',
        items: [
          'امکان «استفاده از موجودی» برای قطعه‌ای که امداد ویژهٔ فعال دارد: مسئول قطعات کد و محل موجودی را انتخاب می‌کند، همان تعداد برای خودرو رزرو و قابل تحویل می‌شود و امداد ویژه بدون تغییر پیگیری می‌شود.',
          'وقتی امداد ویژهٔ چنین قطعه‌ای می‌رسد، تاریخ رسید انبار جدا از تاریخ گزارش ثبت می‌شود و قطعهٔ رسیده جایگزین موجودی برداشته‌شده است؛ برای همان خودرو دوباره رزرو یا تحویل نمی‌شود.',
          'وضعیت موجودی (رزرو، تحویل) و مرحلهٔ امداد ویژه روی همان سطر قطعه، کنار هم و مستقل نمایش داده می‌شوند.',
          'شناسایی قطعات غیرشرکتی موجود در انبار: کدهای بلندتر از ۱۰ نویسه، دارای حروف انگلیسی در انتها یا صفر ابتدایی، با ۸ رقم اول خود با کد اختصاصی قطعه مقایسه می‌شوند.',
          'در انتخاب موجودی، هر نامزد با کد کامل، نام، نشان «شرکتی» یا «غیرشرکتی»، تعداد قابل‌استفاده، تعداد رزروشده، محل انبار و نوع تطبیق («منطبق دقیق»، «همان کد اختصاصی»، «احتمالاً معادل») جداگانه نشان داده می‌شود؛ قطعهٔ غیرشرکتی هرگز خودکار انتخاب نمی‌شود.',
          'اصلاح «لغو رزرو»: فقط همان رزرو آزاد و تعدادش به موجودی قابل‌استفاده برمی‌گردد، قطعه در فهرست مسئول قطعات و در همان پرونده می‌ماند و به «تعیین تکلیف نشده» برمی‌گردد.',
          'اگر قطعه هم رزرو موجودی و هم امداد ویژهٔ فعال دارد، «لغو رزرو» فقط رزرو را لغو می‌کند؛ امداد ویژه، وضعیت، تاریخچه و تاریخ‌های آن دست نمی‌خورند.',
          'پس از «لغو رزرو» قطعهٔ رسیدهٔ امداد ویژه، گزارش روزانهٔ بعدی آن را دوباره خودکار رزرو نمی‌کند تا مسئول قطعات خودش تصمیم بگیرد.',
        ],
      },
      {
        title: 'پرونده خودرو',
        items: [
          'مسئول قطعات از منوی «⋯» هر قطعه می‌تواند «درخواست اصلاح شماره فنی» را با علت کوتاه بفرستد؛ فقط همان قطعه به کارشناس برمی‌گردد.',
          'کارشناس نشان «نیازمند اصلاح شماره فنی»، شمارهٔ اولیه و علت را می‌بیند و با «ثبت و ارسال مجدد» شمارهٔ درست را ثبت می‌کند؛ موجودی با شمارهٔ تازه دوباره تطبیق داده می‌شود و مسئول قطعات خبر می‌گیرد.',
          'شمارهٔ اولیه، شمارهٔ اصلاح‌شده، علت، درخواست‌کننده، کارشناس و زمان‌ها در تاریخچه می‌مانند. اگر قطعه رزرو، تحویل، خرید یا امداد ویژهٔ فعال دارد، اصلاح تا رفع آن توسط مسئول قطعات انجام نمی‌شود و هیچ سفارشی خودکار جابه‌جا یا لغو نمی‌شود.',
        ],
      },
      {
        title: 'امکانات مدیریتی',
        items: [
          'حذف پرونده فقط برای مالک سامانه: با تأیید صریح، پرونده از فهرست‌ها، جست‌وجو، میزهای کار و آمار جاری بیرون می‌رود و رزروهای باز آن آزاد می‌شوند؛ هیچ داده‌ای پاک نمی‌شود.',
          'بخش «پرونده‌های حذف‌شده» برای مالک: جست‌وجو، تاریخ و علت حذف و «بازیابی» پرونده بدون ساختن رزرو یا حرکت موجودی تازه.',
        ],
      },
      {
        title: 'گزارش‌ها و چاپ',
        items: [
          'چاپ «چک‌لیست برداشت قطعات از انبار» برای هر خودرو در قالب PDF آمادهٔ A4: خانهٔ تیک، نام قطعه، کد فنی کامل، تعداد و آدرس قفسه از همان کالای انتخاب‌شده و رزروشده؛ آدرس نامعلوم خالی می‌ماند.',
          'در چک‌لیست برداشت، قطعهٔ موجود در چند محل با تعداد هر محل جدا چاپ می‌شود و با گزینهٔ «همهٔ قطعات» وضعیت قطعات تحویل‌شده، منتظر امداد ویژه یا ناموجود هم با علامت «برداشت نشود» دیده می‌شود. چاپ هیچ رزرو یا موجودی را تغییر نمی‌دهد.',
          'امکان چاپ چک‌لیست بازدید روزانه تمام خودروهای تصادفی، همراه با پلاک، مرحله فعلی، وضعیت، مدت توقف و فضای ثبت یادداشت برای مسئول تصادفات.',
          'چک‌لیست بازدید خودروها A4 افقی است، تاریخ و ساعت شمسی تهیه را دارد، خودروهای دارای تأخیر و مسئلهٔ باز را اول می‌آورد و مدت توقف را به روز کاری کامل نمایندگی حساب می‌کند.',
        ],
      },
      {
        title: 'نسخه و اطلاع‌رسانی',
        items: [
          'نمایش شمارهٔ نسخهٔ در حال اجرا در بالای همهٔ صفحه‌ها (Manage by HEDAX — v1.0.0).',
          'اعلان «نسخه جدید منیج منتشر شد» برای هر کاربر، یک بار برای هر نسخه، با دکمهٔ «مشاهده تغییرات».',
          'صفحهٔ «تاریخچهٔ نسخه‌ها» با شمارهٔ نسخه، تاریخ انتشار، شناسهٔ commit و فهرست کامل تغییرات فارسی.',
          'اگر نسخهٔ تازه‌ای هنگام باز بودن صفحه منتشر شود، منیج پیشنهاد بارگذاری دوباره می‌دهد و هیچ‌وقت خودکار صفحه را تازه نمی‌کند.',
        ],
      },
    ],
  },
];

export const CURRENT_RELEASE: ReleaseNote = RELEASES[0]!;

const parts = (v: string) => v.slice(1).split('.').map(Number) as [number, number, number];

/** Negative when a < b, positive when a > b (semantic version order). */
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}

/** Problems of the release list (CI test): format, order, uniqueness, content. */
export function releaseProblems(list: readonly ReleaseNote[] = RELEASES): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  list.forEach((r, i) => {
    if (!/^v\d+\.\d+\.\d+$/.test(r.version)) out.push(`${r.version}: format`);
    if (seen.has(r.version)) out.push(`${r.version}: duplicate`);
    seen.add(r.version);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) out.push(`${r.version}: date`);
    if (!r.sections.length || r.sections.some((s) => !s.title || !s.items.length || s.items.some((t) => !t.trim()))) out.push(`${r.version}: empty changes`);
    const next = list[i + 1];
    if (next && compareVersions(r.version, next.version) <= 0) out.push(`${r.version}: must be newer than ${next.version}`);
    if (next && r.date < next.date) out.push(`${r.version}: date before ${next.version}`);
  });
  return out;
}

/** What the API reports about the running build. */
export interface VersionInfo {
  version: string;
  /** Short Git commit of the running image, when the build recorded it. */
  commit: string | null;
  /** First start of this version on this server (deployment time). */
  deployedAt: string | null;
  /** The signed-in person has acknowledged this version's announcement. */
  seen: boolean;
}

export interface ReleaseHistoryEntry extends ReleaseNote {
  commit: string | null;
  deployedAt: string | null;
}
