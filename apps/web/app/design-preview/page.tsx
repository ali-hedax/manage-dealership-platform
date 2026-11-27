import Link from 'next/link';

// Index of the design preview (S03/S04). Synthetic data only; for the owner's approval.
const SCREENS = [
  ['components', 'سیستم طراحی', 'توکن‌ها، پلاک، کارت خودرو، مراحل، جدول، کارت شاخص، تذکر و حالت‌ها در دو تم'],
  ['vision', '۱. دیدبان · نمای کلی', 'رومیزی، تم تیره، دوره‌ها و مقایسه'],
  ['vision-tv', '۱. دیدبان · تلویزیون', '۱۹۲۰×۱۰۸۰، چرخش خودکار، دادهٔ پوشیده'],
  ['special-aid', '۲. میز امداد ویژه و دستیار نوبت', 'سه زمان پیشنهادی برای دعوت'],
  ['dispatch', '۳. تقسیم کار دم در (تبلت)', 'جایگاه پیشنهادی هر اجرت در حدود ۱۰ ثانیه'],
  ['technician', '۴. کار تکنسین (گوشی)', 'پس از اسکن QR: شروع، پایان، تذکر'],
  ['waiting-tv', '۵. تلویزیون سالن انتظار مشتری', 'پلاک پوشیده، مرحله و زمان تقریبی'],
  ['vehicle', '۶. پروندهٔ خودرو', 'سربرگ و خط زمانی'],
  ['shop-floor', '۷. تابلوی سالن', 'هر جایگاه، خودروی فعلی، صف و اعلام جابه‌جایی'],
];

export default function DesignPreviewIndex() {
  return (
    <main className="ds ds-page ds-index">
      <header><h1>Manage · پیش‌نمایش طراحی</h1><p className="ds-summary">هفت صفحهٔ کلیدی با دادهٔ ساختگی، برای تأیید مالک. پس از تأیید، مرجع ظاهری همهٔ صفحه‌هاست.</p></header>
      <ul>{SCREENS.map(([href, title, note]) => <li key={href}><Link href={`/design-preview/${href}`}><b>{title}</b><span className="ds-small ds-muted">{note}</span></Link></li>)}</ul>
    </main>
  );
}
