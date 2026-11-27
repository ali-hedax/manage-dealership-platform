'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DsFreshness, DsKpi, DsVehicleCard } from '@/components/ds';
import { AppIcon } from '@/components/AppIcon';
import { STATIONS, VEHICLES } from '@/lib/design-preview-data';

// (1) Vision overview, desktop, dark (S04). Synthetic data. Every number links to the list behind it.
const PERIODS = ['روز', 'هفته', 'ماه', '۶ ماه', 'سال'];
const TABS = ['نمای کلی', 'تصادفات', 'پذیرش تا ترخیص', 'امداد ویژه', 'خودروهای متوقف', 'انبار', 'داغی', 'نوبت و ظرفیت', 'ارزیابی کارکنان'];
const NOW = [38, 41, 37, 44, 46, 43, 49, 52, 48, 55, 58, 54, 61, 63];
const PREV = [35, 36, 40, 38, 39, 42, 41, 44, 45, 43, 47, 46, 48, 50];

const DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ش', 'ی', 'د', 'س', 'چ', 'پ', 'ش', 'امروز'];
const fa = (n: number) => n.toLocaleString('fa-IR');

/** Daily receptions, two weeks: axes with labels, legend, and a tooltip on hover or tap. */
function Chart() {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 200, L = 34, B = 26, max = 70;
  const x = (i: number) => L + (i / (NOW.length - 1)) * (W - L - 8);
  const y = (v: number) => 8 + (1 - v / max) * (H - B - 8);
  const line = NOW.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <div className="ds-chart-wrap">
      <div className="ds-legend" aria-hidden="true"><span><i className="cur" />این دو هفته</span><span><i className="prev" />دورهٔ قبل</span></div>
      <svg className="ds-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`پذیرش روزانه در دو هفتهٔ اخیر؛ امروز ${fa(NOW[NOW.length - 1]!)} پذیرش، دورهٔ قبل ${fa(PREV[PREV.length - 1]!)}`} onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="ds-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--ds-accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--ds-accent)" stopOpacity="0" /></linearGradient></defs>
        {[0, 20, 40, 60].map((g) => <g key={g}><line className="grid" x1={L} x2={W - 8} y1={y(g)} y2={y(g)} /><text x={L - 6} y={y(g) + 4} textAnchor="end">{fa(g)}</text></g>)}
        <line className="axis" x1={L} x2={W - 8} y1={y(0)} y2={y(0)} />
        <line className="axis" x1={L} x2={L} y1={8} y2={y(0)} />
        {DAYS.map((d, i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{d}</text>)}
        <text className="axis-label" x={W - 8} y={10} textAnchor="end">تعداد پذیرش</text>
        <polyline className="prev" points={PREV.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        <polygon className="area" points={`${x(0)},${y(0)} ${line} ${x(NOW.length - 1)},${y(0)}`} />
        <polyline className="line" points={line} />
        {NOW.map((v, i) => (
          <g key={i}>
            <rect className="hit" x={x(i) - 20} y={0} width={40} height={H - B} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            {hover === i && <><line className="cursor" x1={x(i)} x2={x(i)} y1={8} y2={y(0)} /><circle className="dot" cx={x(i)} cy={y(v)} r={4.5} /><circle className="dot prev" cx={x(i)} cy={y(PREV[i]!)} r={3.5} /></>}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="ds-tooltip" role="status" style={{ insetInlineStart: `${(1 - x(hover) / W) * 100}%` }}>
          <b>{DAYS[hover] === 'امروز' ? 'امروز' : `${fa(NOW.length - 1 - hover)} روز پیش`}</b>
          <span><i className="cur" />{fa(NOW[hover]!)} پذیرش</span>
          <span><i className="prev" />{fa(PREV[hover]!)} در دورهٔ قبل</span>
        </div>
      )}
    </div>
  );
}

export default function VisionOverview() {
  const [period, setPeriod] = useState('هفته');
  const [tab, setTab] = useState(0);
  return (
    <div className="ds" data-theme="vision">
      <header className="ds-top">
        <span className="ds-brand">Manage <span>Vision</span></span>
        <span className="ds-muted ds-small">دیدبان · نمایندگی ۱۳۰۷</span>
        <div className="ds-push" />
        <DsFreshness minutesAgo={4} />
        <Link className="ds-btn ghost" href="/design-preview/vision-tv"><AppIcon name="layers" />حالت تلویزیون</Link>
      </header>
      <main className="ds-page">
        <div className="ds-page-head">
          <div className="ds-seg" role="group" aria-label="دوره">{PERIODS.map((p) => <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>{p}</button>)}</div>
          <span className="ds-small ds-muted">مقایسه با {period} قبل</span>
        </div>
        <div className="ds-tabs" role="tablist">{TABS.map((t, i) => <button key={t} role="tab" type="button" className="ds-tab" aria-selected={i === tab} onClick={() => setTab(i)}>{t}</button>)}</div>
        <section className="ds-insights ds-glass" aria-label="جمع‌بندی">
          <p>این هفته <b>۱۲٪ پذیرش بیشتر</b> از هفتهٔ قبل داشتیم؛ بیشترین بار روی <b>نقاشی (جایگاه ۹۹)</b> است.</p>
          <p><b>۹ قطعهٔ امداد ویژه</b> رسیده ولی هنوز مشتری‌اش دعوت نشده؛ قدیمی‌ترین روز ۱۴ است.</p>
          <p>تحویل به‌موقع به <b>۸۷٪</b> رسید؛ ۳ درصد تا هدف.</p>
        </section>
        <div className="ds-kpis">
          <DsKpi xl label="پذیرش این هفته" value={312} delta={12} note="سرویس سریع ۱۸۸ · سالن ۱۲۴" href="#" />
          <DsKpi xl label="خودرو در تعمیرگاه" value={42} delta={8} goodWhenUp={false} note="۵ مورد از مهلت گذشته" href="#" />
          <DsKpi xl label="تحویل به‌موقع" value="۸۷٪" delta={4} note="هدف ۹۰٪" href="#" />
          <DsKpi xl label="برگشتی ۳۰ روزه" value="۲٫۱٪" delta={-0.4} goodWhenUp={false} note="هدف زیر ۳٪" href="#" />
        </div>
        <div className="ds-cols">
          <section className="ds-panel ds-glass" aria-labelledby="v-chart"><div className="ds-panel-head"><h2 id="v-chart">پذیرش روزانه</h2><span className="ds-small ds-muted">روی هر روز بروید تا عدد را ببینید</span></div><Chart /></section>
          <section className="ds-panel ds-glass" aria-labelledby="v-load"><div className="ds-panel-head"><h2 id="v-load">بار جایگاه‌ها امروز</h2></div>
            <div className="ds-bars">{STATIONS.map((s) => <div className="ds-bar" key={s.code}><span>{s.name} {s.code}</span><i><b className={s.load > 100 ? 'crit' : s.load > 70 ? 'warn' : 'good'} style={{ inlineSize: `${Math.min(s.load, 100)}%` }} /></i><span className="ds-num">{s.load.toLocaleString('fa-IR')}٪</span></div>)}</div>
          </section>
        </div>
        <div className="ds-cols">
          <section aria-labelledby="v-stuck"><div className="ds-panel-head"><h2 id="v-stuck">کجا گیر کرده‌ایم</h2><Link className="ds-btn ghost" href="#">همهٔ ۴۲ خودرو</Link></div>
            <div className="ds-grid">{VEHICLES.filter((v) => v.status === 'crit' || v.status === 'warn').map((v) => <DsVehicleCard key={v.caseNo} v={{ ...v, href: '/design-preview/vehicle' }} />)}</div>
          </section>
          <section className="ds-panel ds-glass" aria-labelledby="v-funnel"><div className="ds-panel-head"><h2 id="v-funnel">قیف امداد ویژه · این ماه</h2></div>
            <div className="ds-funnel">{[['رسیده', 64, 0], ['دعوت‌شده', 51, 6], ['آمده', 43, 12], ['نصب‌شده', 40, 16]].map(([l, n, w]) => <div key={l} style={{ ['--w' as string]: w }}><span>{l}</span><b className="ds-num">{(n as number).toLocaleString('fa-IR')}</b></div>)}</div>
          </section>
        </div>
      </main>
    </div>
  );
}
