'use client';
import { useEffect, useState } from 'react';
import { DsFreshness, DsStepper } from '@/components/ds';
import { AppIcon } from '@/components/AppIcon';
import { AID_STEPS, jalaliDayMonth, nextWorkingDays, PARTS } from '@/lib/design-preview-data';

// (2) Special Assist officer's desk with the booking assistant (S04). «دعوت» suggests three slots
// (day + shift + station) before the 20-working-day deadline, matching the station's skill, with
// the most free capacity, all arrived parts of the vehicle in one visit. Synthetic data.
const TABS = [['در انتظار تأمین', 23], ['آمادهٔ دعوت', 9], ['نوبت‌داده‌شده', 17], ['تعیین تکلیف‌شده', 41]] as const;
const SLOT_PLAN = [
  { at: 0, shift: 'صبح', station: 'مکانیک ۴۱', free: 62, why: 'خلوت‌ترین روز پیش از روز کاری ۱۱' },
  { at: 1, shift: 'عصر', station: 'مکانیک ۴۱', free: 48, why: 'مشتری دفعهٔ قبل عصر آمده بود' },
  { at: 3, shift: 'صبح', station: 'جلوبندی ۲۲', free: 55, why: 'هر دو قطعهٔ رسیده در یک مراجعه' },
];
const CALLS = ['پاسخ داد و نوبت گرفت', 'پاسخ داد و انصراف داد', 'پاسخ نداد', 'خاموش', 'شماره اشتباه'];

export default function SpecialAidDesk() {
  const [tab, setTab] = useState(1);
  const [sel, setSel] = useState(0);
  const [slot, setSlot] = useState<number | null>(0);
  const [days, setDays] = useState<string[]>([]);
  useEffect(() => setDays(nextWorkingDays(new Date(), 4).map(jalaliDayMonth)), []);
  const SLOTS = SLOT_PLAN.map((s) => ({ ...s, day: days[s.at] ?? '…' }));
  const p = PARTS[sel]!;
  return (
    <div className="ds">
      <header className="ds-top">
        <span className="ds-brand">Manage</span><span className="ds-muted ds-small">امداد ویژه · میز من</span>
        <input className="ds-input ds-push" placeholder="پلاک، شاسی یا شمارهٔ امداد" aria-label="جست‌وجو" />
        <DsFreshness minutesAgo={12} />
      </header>
      <main className="ds-page">
        <p className="ds-summary">امروز <b>۹ مشتری</b> منتظر دعوت‌اند؛ <b>۲ مورد</b> به روز قرمز نزدیک است.</p>
        <div className="ds-tabs" role="tablist">{TABS.map(([t, n], i) => <button key={t} type="button" role="tab" className="ds-tab" aria-selected={i === tab} onClick={() => setTab(i)}>{t} <span className="ds-tag">{n.toLocaleString('fa-IR')}</span></button>)}</div>
        <div className="ds-desk">
          <section aria-label="آمادهٔ دعوت، به ترتیب رسیدن" className="ds-grid" style={{ gridTemplateColumns: '1fr' }}>
            {PARTS.map((r, i) => (
              <button key={r.aid} type="button" className={`ds-card s-${r.daysLeft <= 3 ? 'crit' : r.daysLeft <= 10 ? 'warn' : 'good'}`} style={{ textAlign: 'start', font: 'inherit', border: 0, cursor: 'pointer', outline: i === sel ? '2px solid var(--ds-accent)' : undefined }} onClick={() => { setSel(i); setSlot(0); }}>
                <div className="ds-card-top"><span className="ds-card-name">{r.name}</span><span className="ds-small ds-muted">{r.plate}</span><span className={`ds-tag ds-card-push ${r.daysLeft <= 3 ? 'crit' : r.daysLeft <= 10 ? 'warn' : 'good'}`}>{r.daysLeft.toLocaleString('fa-IR')} روز کاری مانده</span></div>
                <div className="ds-card-who">{r.customer}<span className="ds-muted">· {r.mobile}</span></div>
                <div>{r.part} <span className="ds-small ds-muted">· کد {r.code}</span></div>
                <div className="ds-card-ids">امداد {r.aid} · رسیده {r.arrived} · شاسی {r.vin}</div>
              </button>
            ))}
          </section>
          <aside className="ds-side" aria-label="جزئیات و دستیار نوبت">
            <div className="ds-panel">
              <div className="ds-panel-head"><h2>{p.name} · {p.customer}</h2><a className="ds-btn" href={`tel:${p.mobile}`}><AppIcon name="send" />تماس</a></div>
              <DsStepper steps={AID_STEPS} current={3} label="مراحل قطعه" />
              <p className="ds-small ds-muted" style={{ marginBlockStart: 'var(--ds-3)' }}>نتیجهٔ تماس با یک لمس ثبت می‌شود:</p>
              <div className="ds-chips" style={{ marginBlockStart: 'var(--ds-2)' }}>{CALLS.map((c) => <button key={c} type="button" className="ds-chip">{c}</button>)}</div>
            </div>
            <div className="ds-panel">
              <div className="ds-panel-head"><h2>دستیار نوبت · ۳ پیشنهاد</h2><span className="ds-small ds-muted">پیش از روز کاری ۲۰</span></div>
              <div style={{ display: 'grid', gap: 'var(--ds-2)' }}>
                {SLOTS.map((s, i) => (
                  <button key={s.day} type="button" className="ds-slot" aria-pressed={slot === i} onClick={() => setSlot(i)}>
                    <b>{s.day} · {s.shift}</b><span className="ds-tag info">{s.station}</span>
                    <span className="ds-small ds-muted" style={{ gridColumn: '1 / -1' }}>{s.why}</span>
                    <span className="ds-bar"><i><b className="good" style={{ inlineSize: `${s.free}%` }} /></i><span className="ds-small">{s.free.toLocaleString('fa-IR')}٪ خالی</span></span>
                  </button>
                ))}
              </div>
              <button type="button" className="ds-btn accent" style={{ inlineSize: '100%', marginBlockStart: 'var(--ds-3)' }}>رزرو موقت؛ در کسب‌وکار ثبت می‌کنم</button>
              <p className="ds-small ds-muted" style={{ marginBlockStart: 'var(--ds-2)' }}>وقتی پالس نوبت را در کسب‌وکار ببیند، خودکار وصل می‌شود.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
