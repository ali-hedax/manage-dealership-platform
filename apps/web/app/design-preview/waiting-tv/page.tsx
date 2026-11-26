'use client';
import { useEffect, useState } from 'react';
import { DsPlate } from '@/components/ds';
import { P } from '@/lib/design-preview-data';

// (5) Customer waiting-room TV (S04): partially masked plate, short car name, stage, estimated
// time left; no customer name; rotates pages of 6 vehicles. Synthetic data.
const STAGES = ['پذیرش', 'در حال تعمیر', 'کنترل کیفیت', 'آمادهٔ تحویل'];
const CARS = [
  { name: 'تارا', plate: P('۲۴', 'ب', '۳۱۸', '۱۶'), stage: 1, eta: '۴۰ دقیقه' },
  { name: 'دنا پلاس', plate: P('۵۳', 'ج', '۷۷۲', '۱۶'), stage: 3, eta: 'آماده' },
  { name: 'ریرا', plate: P('۱۸', 'د', '۴۰۵', '۱۶'), stage: 2, eta: '۱۵ دقیقه' },
  { name: 'رانا', plate: P('۳۱', 'ق', '۲۲۴', '۱۶'), stage: 1, eta: '۱ ساعت و ۲۰ دقیقه' },
  { name: 'پژو ۲۰۷', plate: P('۷۲', 'م', '۶۴۸', '۱۶'), stage: 0, eta: 'حدود ۲ ساعت' },
  { name: 'سورن پلاس', plate: P('۶۷', 'س', '۹۱۲', '۱۶'), stage: 1, eta: 'فردا ۱۱:۰۰' },
];

export default function WaitingRoomTv() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <main className="ds ds-tv" data-theme="vision">
      <header className="ds-page-head">
        <div><h1>خوش آمدید · وضعیت خودروی شما</h1><p className="ds-muted" style={{ fontSize: 18 }}>نمایندگی ایران‌خودرو ۱۳۰۷ · پلاک‌ها برای حریم خصوصی پوشیده‌اند</p></div>
        <span style={{ fontSize: 40, fontWeight: 300 }}>{now}</span>
      </header>
      <section style={{ display: 'grid', gap: 16, alignContent: 'start' }} aria-label="خودروهای امروز">
        {CARS.map((c) => (
          <div className="ds-tv-row" key={c.name}>
            <b>{c.name}</b>
            <DsPlate {...c.plate} masked />
            <div className="ds-tv-progress">{STAGES.map((s, i) => <span key={s} className={i < c.stage ? 'done' : i === c.stage ? 'now' : ''}><i />{s}</span>)}</div>
            <div className="ds-tv-eta">{c.eta}<small>{c.stage === 3 ? 'به پذیرش مراجعه کنید' : 'زمان تقریبی'}</small></div>
          </div>
        ))}
      </section>
      <footer className="ds-muted" style={{ fontSize: 18, display: 'flex', justifyContent: 'space-between' }}><span>با اسکن کد روی برگهٔ پذیرش، وضعیت را روی گوشی خود ببینید.</span><span className="ds-tv-rot"><i className="on" /><i /></span></footer>
    </main>
  );
}
