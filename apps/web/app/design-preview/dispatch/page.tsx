'use client';
import { useState } from 'react';
import { DsFreshness, DsPlate } from '@/components/ds';
import { AppIcon } from '@/components/AppIcon';
import { P } from '@/lib/design-preview-data';

// (3) Dispatch at the door, technical expert on a tablet (S04). A new card from Pulse; for every
// labour line Manage suggests the station that usually does it; the expert confirms or changes it
// and the order is set by tapping. Target: about 10 seconds per vehicle. Synthetic data.
const LINES = [
  { labour: 'تعویض لنت جلو', stations: [['۲۲', 'جلوبندی', 94], ['۴۱', 'مکانیک', 6]] },
  { labour: 'صافکاری درب عقب چپ', stations: [['۳۶', 'صافکاری', 97], ['۳۷', 'صافکاری ۲', 3]] },
  { labour: 'رنگ درب عقب چپ', stations: [['۹۹', 'نقاشی', 100]] },
  { labour: 'تعویض روغن موتور', stations: [['۵۵', 'سرویس سریع', 88], ['۴۱', 'مکانیک', 12]] },
] as const;
const QUEUE = ['دنا پلاس · ۵۳ ج ۷۷۲', 'رانا · ۳۱ ق ۲۲۴', 'پژو ۲۰۷ · ۷۲ م ۶۴۸'];

export default function Dispatch() {
  const [pick, setPick] = useState<string[]>(LINES.map((l) => l.stations[0][0]));
  const order = ['۳۶', '۹۹', '۲۲', '۵۵'];
  const step = (i: number) => { const n = order.indexOf(pick[i]!); return (n < 0 ? i : n) + 1; };
  return (
    <div className="ds">
      <header className="ds-top"><span className="ds-brand">Manage</span><span className="ds-muted ds-small">تقسیم کار دم در</span><div className="ds-push" /><DsFreshness minutesAgo={1} /></header>
      <main className="ds-page ds-tablet">
        <p className="ds-summary"><b>۳ خودروی تازه</b> از کسب‌وکار رسیده؛ برای هر کار جایگاه پیشنهادی را تأیید کنید.</p>
        <section className="ds-panel">
          <div className="ds-panel-head" style={{ flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 'var(--ds-3)', alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 22 }}>تارا</h1><DsPlate {...P('۲۴', 'ب', '۳۱۸', '۱۶')} size="lg" /><span className="ds-tag ins">بیمه</span>
            </div>
            <span className="ds-small ds-muted">پذیرش ۱۴۰۵۰۰۸۶ · سارا محمدی · ۰۹:۱۲</span>
          </div>
          {LINES.map((l, i) => (
            <div className="ds-labour" key={l.labour}>
              <span className="ds-order" aria-label={`ترتیب ${step(i)}`}>{step(i).toLocaleString('fa-IR')}</span>
              <div><b>{l.labour}</b><div className="ds-small ds-muted">پیشنهاد از سابقهٔ ۱۲ ماه: {l.stations[0][1]} {l.stations[0][0]} ({l.stations[0][2].toLocaleString('fa-IR')}٪ موارد)</div></div>
              <div className="ds-chips" role="group" aria-label={`جایگاه ${l.labour}`}>
                {l.stations.map(([code, name]) => <button key={code} type="button" className="ds-chip" aria-pressed={pick[i] === code} onClick={() => setPick((p) => p.map((x, j) => (j === i ? code : x)))}>{code} <small>{name}</small></button>)}
                <button type="button" className="ds-chip"><AppIcon name="add" /><small>دیگر</small></button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 'var(--ds-3)', alignItems: 'center', marginBlockStart: 'var(--ds-4)', flexWrap: 'wrap' }}>
            <span className="ds-small ds-muted">مسیر: ۳۶ ← ۹۹ ← ۲۲ ← ۵۵</span>
            <button type="button" className="ds-btn" style={{ marginInlineStart: 'auto' }}><AppIcon name="print" />چاپ برچسب QR</button>
            <button type="button" className="ds-btn accent big" style={{ blockSize: 48, fontSize: 'var(--ds-fs-card)' }}><AppIcon name="check" />تأیید و بعدی</button>
          </div>
        </section>
        <section aria-label="صف دم در" className="ds-chips">{QUEUE.map((q) => <span key={q} className="ds-chip">{q}</span>)}</section>
      </main>
    </div>
  );
}
