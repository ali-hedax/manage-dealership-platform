'use client';
import { DsFreshness } from '@/components/ds';
import { AppIcon } from '@/components/AppIcon';

// (7) Shop-floor board (S04): each station's current vehicle, its queue and the vehicles waiting
// to move; after every «پایان» an announcement. Works on a PC and on a TV. Synthetic data.
const BOARD = [
  { code: '۳۶', name: 'صافکاری', tech: 'TECH36', now: 'تارا · ۲۴ ب ۳۱۸', job: 'صافکاری درب عقب چپ', left: '۳۵ دقیقه', queue: ['سورن پلاس', 'رانا'], load: 'warn' },
  { code: '۹۹', name: 'نقاشی', tech: 'TECH99', now: 'دنا پلاس · ۵۳ ج ۷۷۲', job: 'رنگ گلگیر جلو', left: '۱ ساعت', queue: ['تارا', 'ریرا', 'رانا'], load: 'crit' },
  { code: '۴۱', name: 'مکانیک', tech: 'TECH41', now: 'پژو ۲۰۷ · ۷۲ م ۶۴۸', job: 'تعویض تسمه تایم', left: '۲۰ دقیقه', queue: ['هایما'], load: 'good' },
  { code: '۲۲', name: 'جلوبندی', tech: 'TECH22', now: null, job: '', left: '', queue: ['تارا'], load: 'good' },
  { code: '۵۵', name: 'سرویس سریع', tech: 'TECH55', now: 'رانا · ۳۱ ق ۲۲۴', job: 'تعویض روغن و فیلتر', left: '۱۰ دقیقه', queue: ['دنا', 'تارا', 'ریرا', 'سورن'], load: 'warn' },
  { code: '۱۲', name: 'برق', tech: 'TECH12', now: 'ریرا · ۱۸ د ۴۰۵', job: 'عیب‌یابی دسته‌سیم', left: '۴۵ دقیقه', queue: [], load: 'good' },
];

export default function ShopFloor() {
  return (
    <main className="ds ds-page" data-theme="vision" style={{ minBlockSize: '100vh' }}>
      <header className="ds-page-head"><div><h1>تابلوی سالن</h1><p className="ds-summary">۱۴ خودرو در سالن · <b>۲ خودرو</b> منتظر جابه‌جایی</p></div><DsFreshness minutesAgo={1} /></header>
      <div className="ds-announce" role="status"><AppIcon name="arrow-left" /><span><b>تارا ۲۴ ب ۳۱۸</b> آمادهٔ رفتن به جایگاه <b>۹۹ نقاشی</b> است</span></div>
      <section className="ds-board" aria-label="جایگاه‌ها">
        {BOARD.map((s) => (
          <article className="ds-station" key={s.code} aria-label={`جایگاه ${s.code}`}>
            <div className="ds-station-head"><span className="ds-station-code">{s.code}</span><b>{s.name}</b><span className={`ds-tag ${s.load} ds-push`}>{s.load === 'crit' ? 'پرتر از ظرفیت' : s.load === 'warn' ? 'نزدیک ظرفیت' : 'جا دارد'}</span></div>
            {s.now ? <div className="ds-station-now"><b>{s.now}</b><span className="ds-small ds-muted">{s.job} · مانده {s.left}</span><span className="ds-small ds-muted">{s.tech}</span></div>
              : <div className="ds-station-now"><span className="ds-muted">خالی · منتظر خودروی بعدی</span></div>}
            <div className="ds-queue">{s.queue.length ? <>صف: {s.queue.map((q) => <span key={q} className="ds-tag">{q}</span>)}</> : 'صف خالی'}</div>
          </article>
        ))}
      </section>
    </main>
  );
}
