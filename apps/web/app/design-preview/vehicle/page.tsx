'use client';
import Link from 'next/link';
import { DsPlate, DsStepper } from '@/components/ds';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { CASE_STEPS, P } from '@/lib/design-preview-data';

// (6) Vehicle file (S04): fixed header (short car name, plate, customer, active badges) and the
// full timeline of the VIN below. Codes stay in «جزئیات فنی». Synthetic data.
const EVENTS: { icon: IconName; title: string; detail: string; when: string; tag?: [string, string] }[] = [
  { icon: 'wrench', title: 'صافکاری درب عقب چپ شروع شد', detail: 'جایگاه ۳۶ · TECH36 · زمان استاندارد ۹۰ دقیقه', when: 'امروز ۱۰:۴۲', tag: ['در حال کار', 'info'] },
  { icon: 'truck', title: 'قطعهٔ امداد ویژه رسید', detail: 'درپوش عقب گیربکس MT6 · امداد ۱۴۰۵۰۰۸۷۵۸۲۳', when: 'دیروز ۱۵:۱۰', tag: ['رسیده', 'good'] },
  { icon: 'alert', title: 'توقف رسمی ثبت شد', detail: 'دریافت مجوز گارانتی از ستاد · اعلام توقف ۹۵۱۹۵۱', when: '۴ آذر', tag: ['فعال', 'warn'] },
  { icon: 'clipboard', title: 'کارشناسی تأیید شد', detail: 'سه اجرت و دو قطعه · کارشناس تصادفات', when: '۳ آذر' },
  { icon: 'car', title: 'پذیرش ۱۴۰۵۰۰۸۶', detail: 'سالن تعمیرات · ۴۲٬۰۸۰ کیلومتر · بیمه', when: '۳ آذر ۰۹:۱۲' },
  { icon: 'history', title: 'سرویس ادواری', detail: 'سرویس سریع · تعویض روغن و فیلتر', when: '۱۲ مرداد' },
];

export default function VehicleFile() {
  return (
    <div className="ds">
      <header className="ds-top"><span className="ds-brand">Manage</span><Link className="ds-btn ghost" href="/design-preview/vision"><AppIcon name="arrow-right" />بازگشت</Link><input className="ds-input ds-push" placeholder="Ctrl+K · پلاک یا شاسی" aria-label="جست‌وجوی سراسری" /></header>
      <main className="ds-page" style={{ maxInlineSize: 980, marginInline: 'auto', inlineSize: '100%' }}>
        <section className="ds-vhead" aria-label="سربرگ پروندهٔ خودرو">
          <svg className="ds-vhead-car" viewBox="0 0 120 64" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden><path d="M8 44h104M14 44v-8c0-3 2-5 5-6l14-4 12-12c2-2 5-3 8-3h26c4 0 7 2 9 5l9 11 10 3c3 1 5 3 5 6v8M30 44a8 8 0 1 0 16 0M78 44a8 8 0 1 0 16 0M48 26h44" /></svg>
          <div style={{ display: 'grid', gap: 'var(--ds-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--ds-3)', alignItems: 'center', flexWrap: 'wrap' }}><h1>تارا</h1><DsPlate {...P('۲۴', 'ب', '۳۱۸', '۱۶')} size="lg" /></div>
            <span>سارا محمدی <span className="ds-muted">· ۰۹۳۵•••۲۷۷۰</span></span>
            <div style={{ display: 'flex', gap: 'var(--ds-1)', flexWrap: 'wrap' }}><span className="ds-tag ins">بیمه</span><span className="ds-tag crit">تصادف</span><span className="ds-tag info">امداد ویژه</span><span className="ds-tag warn">توقف رسمی</span></div>
          </div>
          <div style={{ textAlign: 'end' }}><span className="ds-day">روز ۴</span><p className="ds-small ds-muted" style={{ marginBlockStart: 6 }}>پرونده AC-1405-0142</p></div>
        </section>
        <section className="ds-panel"><div className="ds-panel-head"><h2>پروندهٔ تصادف</h2><span className="ds-small ds-muted">کار بعدی: اجرای صافکاری</span></div><DsStepper steps={CASE_STEPS} current={3} label="مراحل پرونده" /></section>
        <section aria-labelledby="tl"><div className="ds-panel-head"><h2 id="tl">خط زمانی</h2><span className="ds-small ds-muted">همهٔ رویدادهای این شاسی</span></div>
          <ol className="ds-timeline">{EVENTS.map((e) => (
            <li className="ds-ev" key={e.title}><span className="ds-ev-dot"><AppIcon name={e.icon} /></span>
              <div className="ds-ev-body"><div style={{ display: 'flex', gap: 'var(--ds-2)', alignItems: 'center' }}><b>{e.title}</b>{e.tag && <span className={`ds-tag ${e.tag[1]}`}>{e.tag[0]}</span>}</div><span className="ds-small ds-muted">{e.detail}</span><span className="ds-ev-when">{e.when}</span></div></li>
          ))}</ol>
        </section>
        <details className="ds-panel"><summary>مشخصات کامل و جزئیات فنی</summary><p className="ds-small ds-muted" style={{ marginBlockStart: 'var(--ds-2)' }}>3220901 تارا V1P با موتور TU5P، گیربکس MT6 دستی · شاسی NAAP03ED5RJ… · کد محصول ۳۲۲۰۹۰۱</p></details>
      </main>
    </div>
  );
}
