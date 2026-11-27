'use client';
import { DsFreshness } from '@/components/ds';
import { AppIcon } from '@/components/AppIcon';
import { TECHNICIANS } from '@/lib/design-preview-data';

// (7) Shop-floor board (S04, S04b): each station's current vehicle with the technician's name, its
// queue and the vehicles waiting to move; after every «پایان» an announcement. On a PC it is a
// normal page; on a TV (≥1600px) type scales with the screen width and the stations fill it.
const BOARD = [
  { code: '۳۶', name: 'صافکاری', now: 'تارا · ۲۴ ب ۳۱۸', job: 'صافکاری درب عقب چپ', left: '۳۵ دقیقه', queue: ['سورن پلاس', 'رانا'], load: 'warn' },
  { code: '۹۹', name: 'نقاشی', now: 'دنا پلاس · ۵۳ ج ۷۷۲', job: 'رنگ گلگیر جلو', left: '۱ ساعت', queue: ['تارا', 'ریرا', 'رانا'], load: 'crit' },
  { code: '۴۱', name: 'مکانیک', now: 'پژو ۲۰۷ · ۷۲ م ۶۴۸', job: 'تعویض تسمه تایم', left: '۲۰ دقیقه', queue: ['هایما'], load: 'good' },
  { code: '۲۲', name: 'جلوبندی', now: null, job: '', left: '', queue: ['تارا'], load: 'good' },
  { code: '۵۵', name: 'سرویس سریع', now: 'رانا · ۳۱ ق ۲۲۴', job: 'تعویض روغن و فیلتر', left: '۱۰ دقیقه', queue: ['دنا', 'تارا', 'ریرا', 'سورن'], load: 'warn' },
  { code: '۱۲', name: 'برق', now: 'ریرا · ۱۸ د ۴۰۵', job: 'عیب‌یابی دسته‌سیم', left: '۴۵ دقیقه', queue: [], load: 'good' },
] as const;
const LOAD_LABEL = { crit: 'پرتر از ظرفیت', warn: 'نزدیک ظرفیت', good: 'جا دارد' } as const;

export default function ShopFloor() {
  return (
    <main className="ds ds-page ds-shop" data-theme="vision">
      <header className="ds-page-head"><div><h1>تابلوی سالن</h1><p className="ds-summary">۱۴ خودرو در سالن · <b>۲ خودرو</b> منتظر جابه‌جایی</p></div><DsFreshness minutesAgo={1} /></header>
      <div className="ds-announce" role="status"><AppIcon name="arrow-left" /><span><b>تارا ۲۴ ب ۳۱۸</b> آمادهٔ رفتن به جایگاه <b>۹۹ نقاشی</b> است</span></div>
      <section className="ds-board" aria-label="جایگاه‌ها">
        {BOARD.map((s) => (
          <article className="ds-station" key={s.code} aria-label={`جایگاه ${s.code}`}>
            <div className="ds-station-head"><span className="ds-station-code">{s.code}</span><b className="ds-station-name">{s.name}</b><span className={`ds-tag ${s.load} ds-push`}>{LOAD_LABEL[s.load]}</span></div>
            <span className="ds-station-tech"><AppIcon name="user" />{TECHNICIANS[s.code]}</span>
            {s.now ? <div className="ds-station-now"><b>{s.now}</b><span className="ds-muted">{s.job} · مانده {s.left}</span></div>
              : <div className="ds-station-now"><span className="ds-muted">خالی · منتظر خودروی بعدی</span></div>}
            <div className="ds-queue">{s.queue.length ? <>صف: {s.queue.map((q) => <span key={q} className="ds-tag">{q}</span>)}</> : 'صف خالی'}</div>
          </article>
        ))}
      </section>
    </main>
  );
}
