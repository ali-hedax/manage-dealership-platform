'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { pulseErrorText, pulseSentence, type DailyReportsStatus, type PulseStatus, type ReportCenterEntry } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali } from '@/lib/format';
import { useToast } from '@/lib/toast';
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

const RECEPTION_NOTE = 'منیج پالس همهٔ پذیرش‌ها و قطعه‌های هر کارت را هر چند دقیقه خودش می‌خواند. فقط اگر پالس قطع بود، سوابق پذیرش را با این راهنما دستی وارد کنید.';

/**
 * «Manage Nexus · مرکز دادهٔ کسب‌وکار» (owner, 2026-11-23): the one place for every piece of data that
 * comes from کسب‌وکار — the Manage Pulse connection on top, then each report with how it arrives
 * (automatic or by hand), when it last arrived and the step-by-step ISACO path for a new user.
 * Replaces the separate «مرکز گزارش‌ها», «گزارش‌های روزانه» and «منیج پالس» cards of the settings hub;
 * their pages remain and are opened from here.
 */
export default function NexusPage() {
  const { can } = useAuth();
  const toast = useToast();
  const pulseOk = can('integration.manage');
  const centerOk = can('report_center.manage') || can('daily_reports.upload') || can('reference.customers.manage');
  const { data: pulse, mutate: refreshPulse } = useSWR<PulseStatus>(pulseOk ? '/pulse/status' : null, fetcher, { refreshInterval: 30_000 });
  const { data: center, error, mutate: refreshCenter } = useSWR<ReportCenterEntry[]>(centerOk ? '/report-center' : null, fetcher);
  const { data: daily } = useSWR<DailyReportsStatus>(can('daily_reports.upload') || can('daily_reports.apply') ? '/daily-reports/status' : null, fetcher);
  if (!pulseOk && !centerOk) return <EmptyState icon="lock" title="Manage Nexus" heading="h1">این بخش برای مالک، مدیر سیستم و مسئول بارگذاری گزارش‌هاست.</EmptyState>;

  const pulseLive = !!pulse?.configured && !!pulse.enabled;
  const auto = (m: Mode): Mode => (pulseLive ? m : 'manual');
  const entry = (k: ReportCenterEntry['kind']) => center?.find((e) => e.kind === k);
  async function readNow(kind: 'stock_now' | 'emdad_now' | 'appointments_now') {
    const done = { stock_now: 'درخواست خواندن موجودی به پالس داده شد؛ تا یک دقیقه دیگر پیش‌نمایش آماده می‌شود',
      emdad_now: 'گزارش امداد ویژه از کسب‌وکار درخواست شد؛ ساختنش چند دقیقه طول می‌کشد و پالس خودش آن را می‌گیرد',
      appointments_now: 'درخواست خواندن لیست نوبت به پالس داده شد؛ تا یک دقیقه دیگر پیش‌نمایش در «اطلاعات پایه» آماده می‌شود' }[kind];
    try { await api('/pulse/commands', { method: 'POST', body: { kind } }); toast(done); void refreshPulse(); }
    catch (e) { toast(errorMessage(e), 'error'); }
  }
  /** Last run of a report kind, as one short phrase (why the last automatic read did not work). */
  const lastRun = (kind: 'emdad' | 'appointments') => {
    const r = pulse?.runs.find((x) => x.kind === kind);
    if (!r || r.outcome !== 'error') return null;
    return `آخرین تلاش پالس: ${pulseErrorText(r.errorCode) ?? 'ناموفق'}`;
  };
  const AUTO_DETAIL = { emdad: 'پالس روزی یک بار (از ساعت ۱۰:۰۵، نه ۱۶ تا ۱۸) گزارش را درخواست می‌کند و وقتی کسب‌وکار ساخت، می‌گیرد؛ شما فقط پیش‌نمایش را تأیید می‌کنید.',
    appointments: 'پالس روزی یک بار (از ساعت ۱۰:۱۰) لیست را می‌گیرد و پیش‌نمایشش را در «اطلاعات پایه ← نوبت‌های پذیرش» آماده می‌کند؛ بار اول ستون‌ها باید یک بار دستی تأیید شده باشند.' } as const;

  return (
    <div className="stack nexus">
      <header className="nexus-head">
        <span className="nexus-mark" aria-hidden="true"><AppIcon name="layers" /></span>
        <div><h1>Manage Nexus</h1><p>مرکز دادهٔ کسب‌وکار · همهٔ داده‌هایی که از کسب‌وکار به منیج می‌رسد، یک‌جا</p></div>
      </header>

      {pulseOk && <section className="panel nexus-pulse" aria-labelledby="nx-pulse">
        <div className="panel-head"><div><h2 id="nx-pulse">Manage Pulse · اتصال خودکار</h2><p className="small muted">{pulse ? pulseSentence(pulse) : 'در حال خواندن…'}</p></div>
          <div className="row no-print"><Link className="btn btn-sm btn-primary" href="/settings/pulse"><AppIcon name="gear" />اتصال و تنظیمات پالس</Link></div></div>
        {pulse && !pulse.configured && <div className="panel-body"><p className="callout callout-blue small">برای خودکار شدن، در «اتصال و تنظیمات پالس» کد نمایندگی، نام کاربری و کلمه عبور کسب‌وکار را وارد کنید و «شروع» را بزنید. تا آن موقع همهٔ گزارش‌ها دستی وارد می‌شوند.</p></div>}
      </section>}

      <section className="panel" aria-labelledby="nx-reports">
        <div className="panel-head"><div><h2 id="nx-reports">گزارش‌ها</h2><p className="small muted">هر گزارش یا خودکار با پالس می‌رسد یا دستی. هر دو راه به یک مسیر می‌روند: پیش‌نمایش، تأیید، بدون ثبت تکراری.</p></div></div>
        <div className="panel-body nexus-list">
          {error && <p className="callout callout-red small" role="alert">{errorMessage(error)}</p>}
          <ReportRow title="پذیرش‌ها و قطعه‌های هر کارت" mode={auto('auto_manual')} last={pulse?.lastReadAt ?? entry('reception')?.lastImport?.appliedAt ?? null}
            detail={pulseLive ? `امروز ${faNum(pulse?.todayReceptions ?? 0)} پذیرش` : null} open={{ href: '/reception', label: 'پذیرش‌ها' }}
            guide={entry('reception') ? `${RECEPTION_NOTE}\n\n${entry('reception')!.guide}` : RECEPTION_NOTE} isacoPath={entry('reception')?.isacoPath} manualHref={entry('reception')?.uploadHref ?? null} />
          <ReportRow title="موجودی انبار" mode={auto('auto_manual')} last={daily?.stock?.appliedAt ?? null} stale={daily?.stock ? !daily.stock.fresh : undefined}
            detail={pulseLive ? 'پالس روزی یک بار (از ساعت ۱۰) فایل را می‌گیرد؛ شما فقط پیش‌نمایش را تأیید می‌کنید.' : null}
            guide={STOCK_GUIDE} isacoPath="کسب‌وکار ← گزارش موجودی انبار (جست‌وجو: «موجودی انبار»)" manualHref="/daily-reports?kind=stock"
            extra={pulseLive && <button type="button" className="btn btn-sm" onClick={() => void readNow('stock_now')}><AppIcon name="download" />همین الان بخوان</button>} />
          {(['emdad', 'appointments'] as const).map((k) => { const e = entry(k); return e ? (
            <ReportRow key={k} title={e.title} mode={auto('auto_manual')} last={e.lastImport?.appliedAt ?? null} stale={e.lastImport ? e.stale : undefined}
              detail={[pulseLive ? AUTO_DETAIL[k] : null, e.missingDays.length ? `${faNum(e.missingDays.length)} روز کاری بدون گزارش در دو هفتهٔ اخیر` : null].filter(Boolean).join(' · ') || null}
              guide={e.guide} isacoPath={e.isacoPath} manualHref={e.uploadHref} note={pulseLive ? lastRun(k) ?? undefined : undefined}
              extra={pulseLive && <button type="button" className="btn btn-sm" onClick={() => void readNow(k === 'emdad' ? 'emdad_now' : 'appointments_now')}><AppIcon name="download" />همین الان بخوان</button>} />
          ) : null; })}
          {centerOk && <p className="xs muted">راهنماها و بازهٔ پیش‌فرض گزارش‌ها در <Link href="/settings/reports">جزئیات مرکز گزارش‌ها</Link> قابل ویرایش است.</p>}
        </div>
      </section>

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
