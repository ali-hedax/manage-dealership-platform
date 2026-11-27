'use client';
import { useEffect, useState } from 'react';
import { DsPlate } from '@/components/ds';
import { P } from '@/lib/design-preview-data';

// (5) Customer waiting-room TV (S04, S04b): partially masked plate, short car name, stage,
// estimated time left; no customer name. Ready cars first and in green; when there are more
// cars than fit, pages of six rotate every 10 s. Synthetic data.
const STAGES = ['پذیرش', 'در حال تعمیر', 'کنترل کیفیت', 'آمادهٔ تحویل'];
const READY = 3;
const CARS = [
  { name: 'تارا', plate: P('۲۴', 'ب', '۳۱۸', '۱۶'), stage: 1, eta: '۴۰ دقیقه' },
  { name: 'دنا پلاس', plate: P('۵۳', 'ج', '۷۷۲', '۱۶'), stage: 3, eta: 'آماده' },
  { name: 'ریرا', plate: P('۱۸', 'د', '۴۰۵', '۱۶'), stage: 2, eta: '۱۵ دقیقه' },
  { name: 'رانا', plate: P('۳۱', 'ق', '۲۲۴', '۱۶'), stage: 1, eta: '۱ ساعت و ۲۰ دقیقه' },
  { name: 'پژو ۲۰۷', plate: P('۷۲', 'م', '۶۴۸', '۱۶'), stage: 0, eta: 'حدود ۲ ساعت' },
  { name: 'سورن پلاس', plate: P('۶۷', 'س', '۹۱۲', '۱۶'), stage: 1, eta: 'فردا ۱۱:۰۰' },
  { name: 'هایما S7', plate: P('۸۸', 'ن', '۱۴۳', '۱۶'), stage: 3, eta: 'آماده' },
  { name: 'تارا', plate: P('۴۵', 'ی', '۵۰۹', '۱۶'), stage: 2, eta: '۲۵ دقیقه' },
  { name: 'دنا', plate: P('۱۹', 'ط', '۷۳۶', '۱۶'), stage: 1, eta: '۵۰ دقیقه' },
  { name: 'رانا پلاس', plate: P('۶۲', 'ص', '۲۸۱', '۱۶'), stage: 0, eta: 'حدود ۳ ساعت' },
].sort((a, b) => Number(b.stage === READY) - Number(a.stage === READY) || b.stage - a.stage);
const PER_PAGE = 6;
const PAGES = Math.ceil(CARS.length / PER_PAGE);

export default function WaitingRoomTv() {
  const [now, setNow] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }));
    tick();
    const clock = setInterval(tick, 30_000);
    const pager = setInterval(() => setPage((p) => (p + 1) % PAGES), 10_000);
    return () => { clearInterval(clock); clearInterval(pager); };
  }, []);
  const rows = CARS.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  return (
    <main className="ds ds-tv ds-wait" data-theme="vision">
      <header className="ds-page-head">
        <div><h1>خوش آمدید · وضعیت خودروی شما</h1><p className="ds-muted ds-wait-sub">نمایندگی ایران‌خودرو ۱۳۰۷ · پلاک‌ها برای حریم خصوصی پوشیده‌اند</p></div>
        <span className="ds-display ds-wait-clock">{now}</span>
      </header>
      <section className="ds-wait-rows" aria-label="خودروهای امروز" aria-live="polite">
        {rows.map((c) => (
          <div className={`ds-tv-row${c.stage === READY ? ' ready' : ''}`} key={c.plate.b}>
            <b>{c.name}</b>
            <DsPlate {...c.plate} masked />
            <div className="ds-tv-progress">{STAGES.map((s, i) => <span key={s} className={i < c.stage ? 'done' : i === c.stage ? 'now' : ''}><i />{s}</span>)}</div>
            <div className="ds-tv-eta">{c.eta}<small>{c.stage === READY ? 'به پذیرش مراجعه کنید' : 'زمان تقریبی'}</small></div>
          </div>
        ))}
      </section>
      <footer className="ds-muted ds-wait-foot"><span>با اسکن کد روی برگهٔ پذیرش، وضعیت را روی گوشی خود ببینید.</span>
        <span className="ds-tv-rot" aria-label={`صفحهٔ ${(page + 1).toLocaleString('fa-IR')} از ${PAGES.toLocaleString('fa-IR')}`}>{Array.from({ length: PAGES }, (_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</span></footer>
    </main>
  );
}
