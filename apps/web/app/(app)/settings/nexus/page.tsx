'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { featureOpen, pulseErrorText, pulseSentence, type DailyReportsStatus, type PulseStatus, type ReportCenterEntry, type StoppageListView } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { HEAVY_DONE, HEAVY_WORKING } from '@/lib/heavy-report';
import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { ReportUpload } from '@/components/ReportUpload';

type Mode = 'auto' | 'auto_manual' | 'manual';
const MODE_LABEL: Record<Mode, string> = { auto: 'خودکار با پالس', auto_manual: 'خودکار با پالس · دستی در صورت قطع', manual: 'دستی' };

/** Guide for the stock report (the other three come from the report center and stay editable there). */
const STOCK_GUIDE =
  '۱. در کسب‌وکار (b2b.isaco.ir) صفحهٔ «گزارش موجودی انبار» را باز کنید؛ ساده‌ترین راه: جست‌وجوی بالای صفحه (Ctrl K) و نوشتن «موجودی انبار».\n' +
  '۲. سال جاری و «انبار قطعات و لوازم یدکی» را انتخاب کنید؛ بقیهٔ صافی‌ها را خالی بگذارید.\n' +
  '۳. دکمهٔ دریافت فایل را بزنید؛ فایلی با پسوند xls ذخیره می‌شود. آن را باز یا ویرایش نکنید.\n' +
  '۴. در همین صفحه، فایل را در «بارگذاری دستی» بیندازید، پیش‌نمایش را ببینید و تأیید کنید.';

const STOPPAGE_GUIDE =
  '۱. در کسب‌وکار مسیر «بازرگانی ← گزارش ← گزارشات انبار ← گزارش توقف خودرو» را باز کنید.\n' +
  '۲. بازهٔ تاریخ را از یک ماه گذشته تا امروز بگذارید و خروجی Excel بگیرید؛ فایل را باز یا ویرایش نکنید.\n' +
  '۳. در منیج «خودروهای متوقف» را باز کنید، فایل را در «بارگذاری گزارش توقف خودرو» بیندازید، پیش‌نمایش را ببینید و تأیید کنید.\n' +
  'بارگذاری دوبارهٔ همان فایل چیزی را تغییر نمی‌دهد. ردیفی که در فایل تازه نیست با آخرین وضعیتش می‌ماند.';

/** Sources found live in کسب‌وکار that wait for an anonymised sample before Manage reads them (owner, 2026-11-26). */
const NEEDS_SAMPLE: { title: string; path: string; use: string }[] = [
  { title: 'امداد ویژه‌های منتظر دعوت مشتری', path: 'بازرگانی ← مشاهده ← امداد ویژه های منتظر دعوت مشتری', use: 'پروندهٔ امداد ویژه برای هر خودرو (گام ۱E)؛ جدول صفحه‌ای است و Excel ندارد' },
  { title: 'گزارش امداد ویژه‌های باطل‌شده', path: 'بازرگانی ← گزارش ← گزارشات انبار ← گزارش امداد ویژه های باطل شده', use: 'دلیل و تاریخ ابطال برای بازرسی امداد ویژه' },
  { title: 'ثبت کارکرد تعمیرکار', path: 'خدمات ← عملیات ← ثبت کارکرد تعمیرکار', use: 'کد تعمیرکار و زمان واقعی کار برای لیست شب و برنامه‌ریزی' },
  { title: 'شروع و پایان تعمیرات برنامه‌ریزی‌شده', path: 'خدمات ← عملیات ← شروع و پایان تعمیرات برنامه ریزی شده', use: 'زمان شروع و پایان واقعی هر کار' },
  { title: 'عملکرد ریالی تعمیرکاران و جایگاه‌های تعمیراتی', path: 'خدمات ← گزارش ← عملکرد ریالی تعمیرکاران و جایگاههای تعمیراتی', use: 'ارزیابی کارکنان' },
  { title: 'مدیریت لوکیشن قطعه در انبار', path: 'مدیریت لوکیشن قطعه در انبار', use: 'آدرس فیزیکی قطعه (قفسه)' },
  { title: 'گزارش موجودی و لوکیشن', path: 'گزارش مربوط به موجودی و لوکیشن', use: 'موجودی همراه با آدرس فیزیکی' },
];

const RECEPTION_NOTE ='منیج پالس همهٔ پذیرش‌ها و قطعه‌های هر کارت را هر چند دقیقه خودش می‌خواند. فقط اگر پالس قطع بود، سوابق پذیرش را با این راهنما دستی وارد کنید.';

/**
 * «Manage Nexus · مرکز دادهٔ کسب‌وکار» (owner, 2026-11-23): the one place for every piece of data that
 * comes from کسب‌وکار — the Manage Pulse connection on top, then each report with how it arrives
 * (automatic or by hand), when it last arrived and the step-by-step ISACO path for a new user.
 * Replaces the separate «مرکز گزارش‌ها», «گزارش‌های روزانه» and «منیج پالس» cards of the settings hub;
 * their pages remain and are opened from here.
 */
export default function NexusPage() {
  const { can, me } = useAuth();
  const toast = useToast();
  const pulseOk = can('integration.manage');
  const centerOk = can('report_center.manage') || can('daily_reports.upload') || can('reference.customers.manage');
  // The stock read requested by hand: followed (every 3 s) until Pulse reports how it ended.
  const [stockCommand, setStockCommand] = useState<string | null>(null);
  const { data: pulse, mutate: refreshPulse } = useSWR<PulseStatus>(pulseOk ? '/pulse/status' : null, fetcher, { refreshInterval: stockCommand ? 3_000 : 30_000 });
  const followed = stockCommand ? pulse?.commands.find((c) => c.id === stockCommand) : undefined;
  useEffect(() => {
    if (!followed || followed.status === 'pending' || followed.status === 'running') return;
    setStockCommand(null);
    if (followed.status === 'done') toast(HEAVY_DONE);
    else toast(`خواندن موجودی انجام نشد: ${pulseErrorText(followed.resultCode) ?? 'دوباره تلاش کنید'}`, 'error');
  }, [followed, toast]);
  const { data: center, error, mutate: refreshCenter } = useSWR<ReportCenterEntry[]>(centerOk ? '/report-center' : null, fetcher);
  // «خودروهای متوقف» follows the central switch (features.ts): closed for non-owners for now.
  const stoppageOk = can('stoppage.read') && featureOpen('stoppages', me.isOwner, me.openFeatures);
  const { data: stoppage } = useSWR<StoppageListView>(stoppageOk ? '/stoppages?view=active' : null, fetcher);
  const { data: daily } = useSWR<DailyReportsStatus>(can('daily_reports.upload') || can('daily_reports.apply') ? '/daily-reports/status' : null, fetcher);
  if (!pulseOk && !centerOk) return <EmptyState icon="lock" title="Manage Nexus" heading="h1">این بخش برای مالک، مدیر سیستم و مسئول بارگذاری گزارش‌هاست.</EmptyState>;

  const pulseLive = !!pulse?.configured && !!pulse.enabled;
  const auto = (m: Mode): Mode => (pulseLive ? m : 'manual');
  const entry = (k: ReportCenterEntry['kind']) => center?.find((e) => e.kind === k);
  async function readNow(kind: 'stock_now' | 'emdad_now' | 'appointments_now') {
    const done = { stock_now: 'درخواست خواندن موجودی به پالس داده شد؛ تا یک دقیقه دیگر خوانده و ثبت می‌شود',
      emdad_now: 'گزارش امداد ویژه از کسب‌وکار درخواست شد؛ ساختنش چند دقیقه طول می‌کشد و پالس خودش آن را می‌گیرد و ثبت می‌کند',
      appointments_now: 'درخواست خواندن لیست نوبت به پالس داده شد؛ تا یک دقیقه دیگر خوانده و ثبت می‌شود' }[kind];
    try {
      const status = await api<PulseStatus>('/pulse/commands', { method: 'POST', body: { kind } });
      if (kind === 'stock_now') {
        // The same request already queued is followed, not repeated (the API never queues it twice).
        const cmd = status.commands.find((c) => c.kind === 'stock_now' && (c.status === 'pending' || c.status === 'running'));
        if (cmd) setStockCommand(cmd.id);
      } else toast(done);
      void refreshPulse(status, { revalidate: false });
    }
    catch (e) { toast(errorMessage(e), 'error'); }
  }
  /** Last run of a report kind, as one short phrase (why the last automatic read did not work). */
  const lastRun = (kind: 'emdad' | 'appointments') => {
    const r = pulse?.runs.find((x) => x.kind === kind);
    if (!r || r.outcome !== 'error') return null;
    return `آخرین تلاش پالس: ${pulseErrorText(r.errorCode) ?? 'ناموفق'}`;
  };
  const AUTO_DETAIL = { emdad: 'پالس روزی یک بار (از ساعت ۱۰:۰۵، نه ۱۶ تا ۱۸) گزارش را درخواست می‌کند و وقتی کسب‌وکار ساخت، می‌گیرد و خودکار ثبت می‌کند؛ اگر ستون‌های فایل عوض شده باشد، برای تأیید شما می‌ماند.',
    appointments: 'پالس روزی یک بار (از ساعت ۱۰:۱۰) لیست را می‌گیرد و خودکار ثبت می‌کند؛ شرط: ستون‌هایش یک بار دستی تأیید شده باشد. اگر ردیف‌های ناجور زیاد باشد، برای تأیید شما می‌ماند.' } as const;

  return (
    <div className="stack nexus">
      <header className="nexus-head">
        <span className="nexus-mark" aria-hidden="true"><AppIcon name="layers" /></span>
        <div><h1>Manage Nexus</h1><p>مرکز دادهٔ کسب‌وکار · همهٔ داده‌هایی که از کسب‌وکار به منیج می‌رسد، یک‌جا</p></div>
      </header>

      {pulseOk && <section className="panel nexus-pulse" aria-labelledby="nx-pulse">
        <div className="panel-head"><div><h2 id="nx-pulse">Manage Pulse · اتصال خودکار</h2><p className="small muted">{pulse ? pulseSentence(pulse) : 'در حال خواندن…'}</p></div>
          <div className="row no-print"><Link className="btn btn-sm btn-primary" href="/settings/pulse"><AppIcon name="gear" />اتصال و تنظیمات پالس</Link><Link className="btn btn-sm" href="/settings/sources"><AppIcon name="layers" />منبع‌ها</Link></div></div>
        {pulse && !pulse.configured && <div className="panel-body"><p className="callout callout-blue small">برای خودکار شدن، در «اتصال و تنظیمات پالس» کد نمایندگی، نام کاربری و کلمه عبور کسب‌وکار را وارد کنید و «شروع» را بزنید. تا آن موقع همهٔ گزارش‌ها دستی وارد می‌شوند.</p></div>}
      </section>}

      <section className="panel" aria-labelledby="nx-reports">
        <div className="panel-head"><div><h2 id="nx-reports">گزارش‌ها</h2><p className="small muted">هر گزارش یا خودکار با پالس می‌رسد یا دستی. هر دو راه به یک مسیر می‌روند و هیچ فایلی دو بار ثبت نمی‌شود. آنچه پالس می‌خواند خودکار ثبت می‌شود، مگر فایلی که تصمیم شما را لازم دارد.</p></div></div>
        <div className="panel-body nexus-list">
          {error && <p className="callout callout-red small" role="alert">{errorMessage(error)}</p>}
          <ReportRow title="پذیرش‌ها و قطعه‌های هر کارت" mode={auto('auto_manual')} last={pulse?.lastReadAt ?? entry('reception')?.lastImport?.appliedAt ?? null}
            detail={pulseLive ? `امروز ${faNum(pulse?.todayReceptions ?? 0)} پذیرش` : null} open={{ href: '/reception', label: 'پذیرش‌ها' }}
            guide={entry('reception') ? `${RECEPTION_NOTE}\n\n${entry('reception')!.guide}` : RECEPTION_NOTE} isacoPath={entry('reception')?.isacoPath} manualHref={entry('reception')?.uploadHref ?? null} />
          <ReportRow title="موجودی انبار" mode={auto('auto_manual')} last={daily?.stock?.appliedAt ?? null} stale={daily?.stock ? !daily.stock.fresh : undefined}
            detail={pulseLive ? 'پالس روزی یک بار (از ساعت ۱۰) فایل را می‌گیرد و خودکار ثبت می‌کند؛ اگر ستون‌ها عوض شده یا کالاهای زیادی از فایل غایب باشد، برای تأیید شما می‌ماند.' : null}
            guide={STOCK_GUIDE} isacoPath="کسب‌وکار ← گزارش موجودی انبار (جست‌وجو: «موجودی انبار»)" manualHref="/daily-reports?kind=stock"
            note={stockCommand ? HEAVY_WORKING : undefined}
            extra={pulseLive && <button type="button" className="btn btn-sm" disabled={!!stockCommand} aria-busy={!!stockCommand} onClick={() => void readNow('stock_now')}><AppIcon name="download" />{stockCommand ? 'در حال خواندن…' : 'همین الان بخوان'}</button>} />
          {(['emdad', 'appointments'] as const).map((k) => { const e = entry(k); return e ? (
            <ReportRow key={k} title={e.title} mode={auto('auto_manual')} last={e.lastImport?.appliedAt ?? null} stale={e.lastImport ? e.stale : undefined}
              detail={[pulseLive ? AUTO_DETAIL[k] : null, e.missingDays.length ? `${faNum(e.missingDays.length)} روز کاری بدون گزارش در دو هفتهٔ اخیر` : null].filter(Boolean).join(' · ') || null}
              guide={e.guide} isacoPath={e.isacoPath} manualHref={e.uploadHref} note={pulseLive ? lastRun(k) ?? undefined : undefined}
              extra={pulseLive && <button type="button" className="btn btn-sm" onClick={() => void readNow(k === 'emdad' ? 'emdad_now' : 'appointments_now')}><AppIcon name="download" />همین الان بخوان</button>} />
          ) : null; })}
          {stoppageOk && <ReportRow title="گزارش توقف خودرو (توقف رسمی)" mode="manual" last={stoppage?.lastImport?.at ?? null} stale={stoppage?.lastImport ? stoppage.stale : undefined}
            detail="منبع رسمی «خودروهای متوقف» · در حال اعتبارسنجی با گزارش واقعی" guide={STOPPAGE_GUIDE} isacoPath="بازرگانی ← گزارش ← گزارشات انبار ← گزارش توقف خودرو"
            manualHref={can('stoppage.import') ? '/reception/stoppage' : null} open={{ href: '/reception/stoppage', label: 'خودروهای متوقف' }} />}
          {centerOk &&<p className="xs muted">راهنماها و بازهٔ پیش‌فرض گزارش‌ها در <Link href="/settings/reports">جزئیات مرکز گزارش‌ها</Link> قابل ویرایش است.</p>}
        </div>
      </section>

      {pulseOk && <section className="panel" aria-labelledby="nx-needs">
        <div className="panel-head"><div><h2 id="nx-needs">منابع در انتظار نمونه</h2><p className="small muted">این گزارش‌ها در کسب‌وکار پیدا شده‌اند. منیج تا رسیدن یک نمونهٔ بی‌نام از هرکدام، ستون یا مسیری را حدس نمی‌زند.</p></div></div>
        <ul className="panel-body nexus-list">
          {NEEDS_SAMPLE.map((s) => <li key={s.title} className="nexus-row"><div className="nexus-row-top"><div className="nexus-row-name"><strong>{s.title}</strong><span className="m-tag wait">نیازمند نمونه</span></div></div>
            <p className="small muted"><b>مسیر:</b> {s.path} · {s.use}</p></li>)}
        </ul>
      </section>}

      {(can('daily_reports.upload') || can('reference.customers.manage') || can('reference.appointments.manage')) && <section className="panel" aria-labelledby="nx-upload">
        <div className="panel-head"><div><h2 id="nx-upload">بارگذاری دستی</h2><p className="small muted">هر فایل گرفته‌شده از کسب‌وکار را اینجا بیندازید؛ منیج نوعش را از محتوا می‌شناسد و به همان پیش‌نمایش همیشگی می‌برد.</p></div></div>
        <div className="panel-body"><ReportUpload onDone={() => void refreshCenter()} /></div>
      </section>}
    </div>
  );
}

function ReportRow({ title, mode, last, stale, detail, guide, isacoPath, manualHref, open, extra, note }: {
  title: string; mode: Mode; last: string | null; stale?: boolean; detail?: string | null; guide: string; isacoPath?: string;
  manualHref: string | null; open?: { href: string; label: string }; extra?: React.ReactNode; note?: string;
}) {
  return (
    <article className="nexus-row">
      <div className="nexus-row-top">
        <div className="nexus-row-name"><strong>{title}</strong>
          <span className={`m-tag ${mode === 'manual' ? 'wait' : 'ok'}`}>{MODE_LABEL[mode]}</span>
          {stale === true && <span className="m-tag stop">قدیمی</span>}
        </div>
        <div className="row no-print">{extra}{open && <Link className="btn btn-sm" href={open.href}>{open.label}</Link>}{manualHref && <Link className="btn btn-sm btn-ghost" href={manualHref}><AppIcon name="upload" />بارگذاری دستی</Link>}</div>
      </div>
      <p className="small muted">{last ? `آخرین ورود: ${formatJalali(last, { time: true })}` : 'هنوز وارد نشده'}{detail ? ` · ${detail}` : ''}{note ? ` · ${note}` : ''}</p>
      <details className="nexus-guide"><summary>راهنمای گرفتن این گزارش از کسب‌وکار</summary>
        {isacoPath && <p className="small"><b>مسیر:</b> {isacoPath}</p>}
        <p className="small" style={{ whiteSpace: 'pre-line' }}>{guide}</p>
      </details>
    </article>
  );
}
