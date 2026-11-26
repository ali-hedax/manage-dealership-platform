'use client';
import { useEffect, useState } from 'react';
import { DsFreshness, DsKpi } from '@/components/ds';
import { STATIONS } from '@/lib/design-preview-data';

// (1) Vision on a TV (S04): 1920×1080, read-only revocable link, pages rotate every 15 s,
// sensitive data masked (no names, no full plates or amounts). Synthetic data.
const PAGES = ['نمای کلی', 'بار جایگاه‌ها', 'امداد ویژه'] as const;

export default function VisionTv() {
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPage((p) => (p + 1) % PAGES.length), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <main className="ds ds-tv" data-theme="vision" aria-live="polite">
      <header className="ds-page-head">
        <div><h1>دیدبان · {PAGES[page]}</h1><p className="ds-muted" style={{ fontSize: 18 }}>نمایندگی ۱۳۰۷ · پنج‌شنبه ۶ آذر ۱۴۰۵</p></div>
        <DsFreshness minutesAgo={4} />
      </header>
      {page === 0 && (
        <div className="ds-kpis ds-tv-kpis" style={{ ['--n' as string]: 4 }}>
          <DsKpi xl label="پذیرش امروز" value={61} delta={9} note="سرویس سریع ۳۸ · سالن ۲۳" />
          <DsKpi xl label="در تعمیرگاه" value={42} delta={8} goodWhenUp={false} note="۵ مورد از مهلت گذشته" />
          <DsKpi xl label="تحویل به‌موقع" value="۸۷٪" delta={4} note="هدف ۹۰٪" />
          <DsKpi xl label="شب‌مانده" value={27} delta={-6} goodWhenUp={false} note="ظرفیت محوطه ۵۰" />
        </div>
      )}
      {page === 1 && (
        <div className="ds-bars ds-tv-bars">
          {STATIONS.map((s) => <div className="ds-bar" key={s.code}><span>{s.name} {s.code}</span><i><b className={s.load > 100 ? 'crit' : s.load > 70 ? 'warn' : 'good'} style={{ inlineSize: `${Math.min(s.load, 100)}%` }} /></i><span>{s.load.toLocaleString('fa-IR')}٪</span></div>)}
        </div>
      )}
      {page === 2 && (
        <div className="ds-kpis ds-tv-kpis" style={{ ['--n' as string]: 3 }}>
          <DsKpi xl label="رسیده، دعوت‌نشده" value={9} note="قدیمی‌ترین: روز کاری ۱۴" />
          <DsKpi xl label="نوبت‌داده‌شده" value={17} note="۶ نوبت برای فردا" />
          <DsKpi xl label="مصرف به‌موقع" value="۹۱٪" delta={3} note="تا ۲۰ روز کاری" />
        </div>
      )}
      <footer className="ds-tv-rot" aria-label="صفحه‌ها">{PAGES.map((p, i) => <i key={p} className={i === page ? 'on' : ''} />)}</footer>
    </main>
  );
}
