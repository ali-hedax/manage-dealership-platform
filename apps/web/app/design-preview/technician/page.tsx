'use client';
import { useEffect, useState } from 'react';
import { DsPlate } from '@/components/ds';
import { AppIcon } from '@/components/AppIcon';
import { P } from '@/lib/design-preview-data';

// (4) Technician's job on a phone after scanning the route QR (S04): only their own job, two big
// buttons «شروع» / «پایان», «تذکر» for a missing or late part, wage per vehicle and month. Synthetic.
export default function TechnicianJob() {
  const [running, setRunning] = useState(false);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
  return (
    <main className="ds ds-phone">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="ds-brand">Manage</span><span className="ds-tag">جایگاه ۳۶ · صافکاری</span>
      </header>
      <section className="ds-job" aria-label="کار من">
        <div style={{ display: 'flex', gap: 'var(--ds-3)', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="ds-job-title">تارا</span><DsPlate {...P('۲۴', 'ب', '۳۱۸', '۱۶')} size="lg" />
        </div>
        <p style={{ fontSize: 18 }}>صافکاری درب عقب چپ</p>
        <p className="ds-small ds-muted">زمان استاندارد ۹۰ دقیقه · بعد از شما: نقاشی ۹۹</p>
        <div className="ds-timer" role="timer" aria-live="off">{mm.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]!)}:{ss.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]!)}</div>
        <div className="ds-bigbtns">
          <button type="button" className="ds-btn big start" onClick={() => setRunning(true)} disabled={running}><AppIcon name="clock" />شروع</button>
          <button type="button" className="ds-btn big stop" onClick={() => setRunning(false)}><AppIcon name="check" />پایان</button>
        </div>
      </section>
      <section aria-label="تذکر" className="ds-nudges">
        <button type="button" className="ds-btn" style={{ blockSize: 52 }}><AppIcon name="box" />قطعه نیست</button>
        <button type="button" className="ds-btn" style={{ blockSize: 52 }}><AppIcon name="clock" />قطعه دیر شد</button>
      </section>
      <section className="ds-panel" aria-label="دستمزد">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="ds-muted">دستمزد این خودرو</span><b className="ds-num">۱٬۲۰۰٬۰۰۰ ریال</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBlockStart: 'var(--ds-2)' }}><span className="ds-muted">جمع آذر</span><b className="ds-num">۳۸٬۴۰۰٬۰۰۰ ریال</b></div>
      </section>
      <p className="ds-small ds-muted" style={{ textAlign: 'center' }}>کار بعدی: رانا · ۳۱ ق ۲۲۴</p>
    </main>
  );
}
