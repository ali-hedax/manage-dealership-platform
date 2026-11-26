'use client';
import Link from 'next/link';
import { DsFreshness, DsKpi, DsPlate, DsReminder, DsState, DsStepper, DsTable, DsVehicleCard } from '@/components/ds';
import { CASE_STEPS, P, PARTS, VEHICLES } from '@/lib/design-preview-data';

// /design-preview/components — the locked design system in the light (desk) and dark (Vision/TV)
// themes side by side (slice S03, CORE-12 part 1). Synthetic data only.
const SWATCHES: [string, string][] = [
  ['--ds-bg', 'زمینه'], ['--ds-surface', 'سطح'], ['--ds-line', 'خط'], ['--ds-text', 'متن'], ['--ds-muted', 'متن کم‌رنگ'],
  ['--ds-accent', 'شامپاینی'], ['--ds-good', 'خوب'], ['--ds-warn', 'هشدار'], ['--ds-crit', 'بحرانی'], ['--ds-info', 'اطلاع'],
];

function Showcase({ theme }: { theme: 'desk' | 'vision' }) {
  return (
    <section className="ds ds-page" data-theme={theme === 'vision' ? 'vision' : undefined} aria-label={theme === 'vision' ? 'تم تیره دیدبان' : 'تم روشن میزها'}>
      <header className="ds-page-head">
        <div>
          <h1>{theme === 'vision' ? 'تم تیره · دیدبان و تلویزیون' : 'تم روشن · میزهای کار'}</h1>
          <p className="ds-summary">سیستم طراحی قفل‌شدهٔ منیج: <b>یک فونت، یک خانوادهٔ آیکون، یک فایل توکن</b>.</p>
        </div>
        <DsFreshness minutesAgo={theme === 'vision' ? 42 : 6} />
      </header>

      <div className="ds-panel">
        <div className="ds-panel-head"><h2>رنگ‌ها</h2><span className="ds-small ds-muted">رنگ وضعیت فقط برای معنا</span></div>
        <div className="ds-swatches">{SWATCHES.map(([v, label]) => <span key={v} className="ds-swatch"><i style={{ background: `var(${v})` }} />{label}<code className="ds-muted">{v}</code></span>)}</div>
      </div>

      <div className="ds-panel">
        <div className="ds-panel-head"><h2>تایپوگرافی و کنترل‌ها</h2></div>
        <div style={{ display: 'grid', gap: 'var(--ds-3)' }}>
          <p style={{ fontSize: 'var(--ds-fs-kpi-xl)', fontWeight: 300 }}>۴۲</p>
          <h1>عنوان صفحه · ۱۸</h1>
          <h2>عنوان کارت · ۱۵</h2>
          <p>متن پایه · ۱۳ — امروز ۳ خودرو منتظر قطعه‌اند.</p>
          <p className="ds-small ds-muted">متن کوچک · ۱۲ — آخرین به‌روزرسانی ده دقیقه پیش</p>
          <div style={{ display: 'flex', gap: 'var(--ds-2)', flexWrap: 'wrap' }}>
            <button type="button" className="ds-btn primary">اقدام اصلی</button>
            <button type="button" className="ds-btn accent">دعوت مشتری</button>
            <button type="button" className="ds-btn">ثانویه</button>
            <button type="button" className="ds-btn ghost">بی‌قاب</button>
            <input className="ds-input" placeholder="پلاک یا شاسی" aria-label="نمونهٔ ورودی" />
          </div>
          <div style={{ display: 'flex', gap: 'var(--ds-2)', flexWrap: 'wrap' }}>
            <span className="ds-tag gold">کارت طلایی</span><span className="ds-tag ins">بیمه</span><span className="ds-tag own">شخصی</span>
            <span className="ds-tag good">به‌موقع</span><span className="ds-tag warn">روز ۱۱</span><span className="ds-tag crit">روز ۱۸</span><span className="ds-tag info">در خرید</span>
          </div>
        </div>
      </div>

      <div className="ds-panel">
        <div className="ds-panel-head"><h2>پلاک ایران · سه اندازه</h2></div>
        <div style={{ display: 'flex', gap: 'var(--ds-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          <DsPlate {...P('۲۴', 'ب', '۳۱۸', '۱۶')} size="sm" />
          <DsPlate {...P('۲۴', 'ب', '۳۱۸', '۱۶')} />
          <DsPlate {...P('۲۴', 'ب', '۳۱۸', '۱۶')} size="lg" />
          <DsPlate {...P('۲۴', 'ب', '۳۱۸', '۱۶')} masked />
        </div>
      </div>

      <div>
        <div className="ds-panel-head"><h2>کارت خودرو</h2><span className="ds-small ds-muted">وضعیت فقط با نوار باریک کنار کارت</span></div>
        <div className="ds-grid">{VEHICLES.slice(0, 4).map((v) => <DsVehicleCard key={v.caseNo} v={v} />)}</div>
      </div>

      <div className="ds-panel">
        <div className="ds-panel-head"><h2>مراحل قفل‌دار</h2></div>
        <DsStepper steps={CASE_STEPS} current={3} label="مراحل پرونده" />
      </div>

      <div className="ds-kpis">
        <DsKpi label="خودرو در تعمیرگاه" value={42} delta={8} goodWhenUp={false} note="۵ خودرو از مهلت گذشته" href="/design-preview/vision" />
        <DsKpi label="تحویل به‌موقع" value="۸۷٪" delta={4} note="هدف: ۹۰٪" />
        <DsKpi label="قطعهٔ امداد رسیده، دعوت‌نشده" value={9} delta={-12} goodWhenUp={false} note="قدیمی‌ترین: روز ۱۴" />
        <DsKpi label="برگشتی ۳۰ روزه" value="۲٫۱٪" delta={-0.4} goodWhenUp={false} note="هدف: کمتر از ۳٪" />
      </div>

      <DsTable caption="قطعه‌های امداد ویژهٔ آمادهٔ دعوت" rows={PARTS} columns={[
        { key: 'name', label: 'خودرو' }, { key: 'plate', label: 'پلاک' }, { key: 'customer', label: 'مشتری' },
        { key: 'part', label: 'قطعه' }, { key: 'code', label: 'کد', numeric: true }, { key: 'arrived', label: 'رسیدن' },
        { key: 'daysLeft', label: 'روز کاری مانده', numeric: true, render: (r) => <span className={`ds-tag ${r.daysLeft <= 3 ? 'crit' : r.daysLeft <= 10 ? 'warn' : 'good'}`}>{r.daysLeft.toLocaleString('fa-IR')}</span> },
      ]} />

      <div className="ds-grid">
        <DsReminder from="مدیر خدمات" to="کارشناس امداد ویژه" vehicle="سورن پلاس ۶۷ س ۹۱۲" text="قطعه از دیروز رسیده؛ لطفاً امروز با مشتری تماس بگیرید." when="۱۰ دقیقه پیش" />
        <DsState kind="empty" title="امروز کاری در صف نیست" hint="خودروی تازه که برسد، همین‌جا می‌بینید." />
        <DsState kind="loading" title="در حال خواندن…" hint="داده از کسب‌وکار در راه است." />
        <DsState kind="error" title="کسب‌وکار پاسخ نداد" hint="آخرین دادهٔ معتبر نمایش داده می‌شود؛ چند دقیقهٔ دیگر دوباره تلاش می‌شود." />
      </div>
      <nav className="ds-small ds-muted" aria-label="صفحه‌های پیش‌نمایش"><Link href="/design-preview">← همهٔ صفحه‌های پیش‌نمایش</Link></nav>
    </section>
  );
}

export default function ComponentsPreview() {
  return <><Showcase theme="desk" /><Showcase theme="vision" /></>;
}
