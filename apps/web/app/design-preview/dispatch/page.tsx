'use client';
import { useState } from 'react';
import { DsFreshness, DsPlate } from '@/components/ds';
import { AppIcon } from '@/components/AppIcon';
import { P } from '@/lib/design-preview-data';

// (3) Dispatch at the door, technical expert on a tablet (S04, S04b). A new card from Pulse; for
// every labour line Manage suggests the station that usually does it; the expert confirms or
// changes it. Jobs are listed in their planned order; the order changes by dragging a row, by the
// ▲/▼ buttons or by tapping the order number (moves that job first). The route follows the order.
// Target: about 10 seconds per vehicle. Synthetic data.
const LINES = [
  { labour: 'صافکاری درب عقب چپ', stations: [['۳۶', 'صافکاری', 97], ['۳۷', 'صافکاری ۲', 3]] },
  { labour: 'رنگ درب عقب چپ', stations: [['۹۹', 'نقاشی', 100]] },
  { labour: 'تعویض لنت جلو', stations: [['۲۲', 'جلوبندی', 94], ['۴۱', 'مکانیک', 6]] },
  { labour: 'تعویض روغن موتور', stations: [['۵۵', 'سرویس سریع', 88], ['۴۱', 'مکانیک', 12]] },
] as const;
const QUEUE = ['دنا پلاس · ۵۳ ج ۷۷۲', 'رانا · ۳۱ ق ۲۲۴', 'پژو ۲۰۷ · ۷۲ م ۶۴۸'];
const fa = (n: number) => n.toLocaleString('fa-IR');

export default function Dispatch() {
  const [pick, setPick] = useState<string[]>(LINES.map((l) => l.stations[0][0]));
  const [order, setOrder] = useState<number[]>(LINES.map((_, i) => i));
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => setOrder((o) => {
    if (to < 0 || to >= o.length || from === to) return o;
    const next = [...o];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    return next;
  });
  const route = order.map((i) => pick[i]).join(' ← ');
  return (
    <div className="ds">
      <header className="ds-top"><span className="ds-brand">Manage</span><span className="ds-muted ds-small">تقسیم کار دم در</span><div className="ds-push" /><DsFreshness minutesAgo={1} /></header>
      <main className="ds-page ds-tablet">
        <p className="ds-summary"><b>۳ خودروی تازه</b> از کسب‌وکار رسیده؛ برای هر کار جایگاه پیشنهادی را تأیید و ترتیب را مشخص کنید.</p>
        <section className="ds-panel">
          <div className="ds-panel-head" style={{ flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 'var(--ds-3)', alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 22 }}>تارا</h1><DsPlate {...P('۲۴', 'ب', '۳۱۸', '۱۶')} size="lg" /><span className="ds-tag ins">بیمه</span>
            </div>
            <span className="ds-small ds-muted">پذیرش ۱۴۰۵۰۰۸۶ · سارا محمدی · ۰۹:۱۲</span>
          </div>
          <ol className="ds-labours" aria-label="کارها به ترتیب انجام">
            {order.map((li, pos) => {
              const l = LINES[li]!;
              return (
                <li key={l.labour} className={`ds-labour${drag === pos ? ' dragging' : ''}`} draggable
                  onDragStart={() => setDrag(pos)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, pos); setDrag(null); }} onDragEnd={() => setDrag(null)}>
                  <div className="ds-order-ctl">
                    <button type="button" className="ds-order" title="انتقال به اول" aria-label={`ترتیب ${fa(pos + 1)}؛ انتقال به اول`} onClick={() => move(pos, 0)}>{fa(pos + 1)}</button>
                    <span className="ds-order-arrows">
                      <button type="button" aria-label="بالاتر" disabled={pos === 0} onClick={() => move(pos, pos - 1)}>▲</button>
                      <button type="button" aria-label="پایین‌تر" disabled={pos === order.length - 1} onClick={() => move(pos, pos + 1)}>▼</button>
                    </span>
                  </div>
                  <div><b>{l.labour}</b><div className="ds-small ds-muted">پیشنهاد از سابقهٔ ۱۲ ماه: {l.stations[0][1]} {l.stations[0][0]} ({fa(l.stations[0][2])}٪ موارد)</div></div>
                  <div className="ds-chips" role="group" aria-label={`جایگاه ${l.labour}`}>
                    {l.stations.map(([code, name]) => <button key={code} type="button" className="ds-chip" aria-pressed={pick[li] === code} onClick={() => setPick((p) => p.map((x, j) => (j === li ? code : x)))}>{code} <small>{name}</small></button>)}
                    <button type="button" className="ds-chip"><AppIcon name="add" /><small>دیگر</small></button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div style={{ display: 'flex', gap: 'var(--ds-3)', alignItems: 'center', marginBlockStart: 'var(--ds-4)', flexWrap: 'wrap' }}>
            <span className="ds-route" aria-live="polite">مسیر: <b>{route}</b></span>
            <button type="button" className="ds-btn" style={{ marginInlineStart: 'auto' }}><AppIcon name="print" />چاپ برچسب QR</button>
            <button type="button" className="ds-btn accent big" style={{ blockSize: 48, fontSize: 'var(--ds-fs-card)' }}><AppIcon name="check" />تأیید و بعدی</button>
          </div>
        </section>
        <section aria-label="صف دم در" className="ds-chips">{QUEUE.map((q) => <span key={q} className="ds-chip">{q}</span>)}</section>
      </main>
    </div>
  );
}
