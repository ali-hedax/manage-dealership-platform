'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  PULSE_COMMAND_LABELS, PULSE_RUN_KIND_LABELS, formatJalali, pulseErrorText, toLatinDigits, toPersianDigits,
  type PulseReviewRow, type PulseStatus,
} from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';
import { PlateText } from '@/components/Plate';
import { PulseStatusPanel } from '@/components/PulseStatusPanel';

/**
 * «منیج پالس · اتصال کسب‌وکار» (spec section 26): dealer code, user name and a write-only
 * password; test, start and stop; reading interval, hours and window; the captcha answer;
 * the 20 latest runs and admissions waiting for review. Owner and system administrator only.
 */
export default function PulseSettingsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const allowed = can('integration.manage');
  const { data: s, error, mutate } = useSWR<PulseStatus>(allowed ? '/pulse/status' : null, fetcher, { refreshInterval: 15_000 });
  const { data: review } = useSWR<PulseReviewRow[]>(allowed && s?.reviewCount ? `/pulse/review?n=${s.reviewCount}` : null, fetcher);
  const [busy, setBusy] = useState(false);
  if (!allowed) return <EmptyState icon="lock" title="منیج پالس" heading="h1">این بخش فقط برای مالک و مدیر سیستم است.</EmptyState>;
  if (error) return <p role="alert" className="m-error">{errorMessage(error)}</p>;
  if (!s) return <p className="muted small" role="status">در حال خواندن وضعیت منیج پالس…</p>;
  async function send(path: string, body: unknown, ok: string, method: 'POST' | 'PUT' = 'POST') {
    setBusy(true);
    try { await mutate(await api<PulseStatus>(path, { method, body }), { revalidate: false }); toast(ok); return true; }
    catch (e) { toast(errorMessage(e), 'error'); await mutate(); return false; } finally { setBusy(false); }
  }
  const pending = (kind: string) => s.commands.some((c) => c.kind === kind && (c.status === 'pending' || c.status === 'running'));
  const canRun = s.featureEnabled && s.configured;
  return (
    <div className="stack pulse-page">
      <header className="page-title">
        <span className="page-title-ico" aria-hidden="true"><AppIcon name="layers" /></span>
        <div><h1>منیج پالس · اتصال کسب‌وکار</h1><p>خواندن خودکار پذیرش‌ها، کارت‌ها و قطعات از کسب‌وکار ایران‌خودرو؛ فقط‌خواندنی، هیچ چیزی در کسب‌وکار ثبت نمی‌شود.</p></div>
      </header>

      <PulseStatusPanel data={s} />
      <div className="row no-print">
        <button type="button" className="btn" disabled={busy || !canRun || pending('test')} onClick={() => void send('/pulse/commands', { kind: 'test' }, 'آزمایش اتصال در صف قرار گرفت')}><AppIcon name="check" />{pending('test') ? 'آزمایش در جریان…' : 'آزمایش اتصال'}</button>
        {s.enabled
          ? <button type="button" className="btn" disabled={busy} onClick={() => void send('/pulse/stop', { expectedVersion: s.version }, 'پالس متوقف شد')}>توقف</button>
          : <button type="button" className="btn btn-primary" disabled={busy || !canRun || !s.secretReady} onClick={() => void send('/pulse/start', { expectedVersion: s.version }, 'پالس شروع شد')}>شروع</button>}
        {s.enabled && <button type="button" className="btn btn-ghost" disabled={busy || pending('sync_now')} onClick={() => void send('/pulse/commands', { kind: 'sync_now' }, 'خواندن فوری در صف قرار گرفت')}>{pending('sync_now') ? 'در حال خواندن…' : 'همین الان بخوان'}</button>}
      </div>

      {s.state === 'captcha' && s.captchaImage && <CaptchaBox image={s.captchaImage} busy={busy || pending('captcha_answer')} onAnswer={(answer) => send('/pulse/captcha', { answer }, 'کد امنیتی فرستاده شد؛ پالس یک بار دوباره وارد می‌شود')} />}

      <CredentialsForm s={s} busy={busy} onSave={(body) => send('/pulse/credentials', body, 'اطلاعات ورود ذخیره شد', 'PUT')} />
      {s.configured && <SettingsForm s={s} busy={busy} onSave={(body) => send('/pulse/settings', body, 'تنظیمات پالس ذخیره شد', 'PUT')} />}
      {s.configured && <BackfillForm s={s} busy={busy || !canRun || pending('backfill')} onStart={(from) => send('/pulse/commands', { kind: 'backfill', from }, 'بارگذاری اولیه در صف قرار گرفت')} />}

      {!!review?.length && <section className="panel" aria-labelledby="pulse-review">
        <div className="panel-head"><div><h2 id="pulse-review">نیازمند بررسی ({faNum(review.length)})</h2><p className="small muted">این پذیرش‌ها با بیش از یک پروندهٔ تصادفی جور شدند و خودکار وصل نمی‌شوند. شمارهٔ پذیرش یا VIN را در پرونده‌ها اصلاح کنید؛ خواندن بعدی دوباره تطبیق می‌دهد.</p></div></div>
        <div className="panel-body table-scroll"><table className="table static"><thead><tr><th>پذیرش</th><th>پلاک</th><th>خودرو</th><th>پرونده‌های جور</th></tr></thead><tbody>
          {review.map((r) => <tr key={r.receptionId}><td><Link href={`/reception/${r.receptionId}`}><bdi>{toPersianDigits(r.admissionNo ?? '—')}</bdi></Link></td><td><PlateText value={r.plate} /></td><td>{r.vehicleName ?? '—'}</td><td>{r.candidates.map((c) => <Link key={c.caseId} className="m-tag mute" href={`/cases/${c.caseId}`}>{toPersianDigits(c.caseNumber)}</Link>)}</td></tr>)}
        </tbody></table></div>
      </section>}

      <section className="panel" aria-labelledby="pulse-runs">
        <div className="panel-head"><div><h2 id="pulse-runs">اجراهای اخیر</h2><p className="small muted">۲۰ اجرای آخر؛ بدون دادهٔ مشتری و بدون رمز.</p></div></div>
        <div className="panel-body">
          {!s.runs.length ? <p className="m-empty">پالس هنوز اجرا نشده است.</p> : <div className="table-scroll"><table className="table static pulse-runs"><thead><tr><th>زمان</th><th>کار</th><th>نتیجه</th><th>خوانده</th><th>جدید</th><th>تغییر</th><th>خطا</th></tr></thead><tbody>
            {s.runs.map((r) => <tr key={r.id}>
              <td>{formatJalali(r.startedAt, { time: true })}</td><td>{PULSE_RUN_KIND_LABELS[r.kind] ?? r.kind}</td>
              <td><span className={`m-tag ${r.outcome === 'ok' ? 'ok' : r.outcome === 'error' ? 'stop' : 'mute'}`}>{r.outcome === 'ok' ? 'موفق' : r.outcome === 'error' ? 'ناموفق' : 'در جریان'}</span></td>
              <td>{faNum(r.read)}</td><td>{faNum(r.created)}</td><td>{faNum(r.changed)}</td><td className="small">{pulseErrorText(r.errorCode) ?? '—'}{r.details && <details><summary className="xs">جزئیات فنی</summary><pre className="xs pulse-details" dir="ltr">{JSON.stringify(r.details, null, 1)}</pre></details>}</td>
            </tr>)}
          </tbody></table></div>}
          {s.commands.length > 0 && <ul className="rcp-lines pulse-commands">{s.commands.map((c) => <li key={c.id}><span className="small"><b>{PULSE_COMMAND_LABELS[c.kind]}</b> · {formatJalali(c.createdAt, { time: true })}</span>
            <span className="row xs"><span className={`m-tag ${c.status === 'done' ? 'ok' : c.status === 'failed' ? 'stop' : 'wait'}`}>{c.status === 'done' ? 'انجام شد' : c.status === 'failed' ? 'ناموفق' : c.status === 'running' ? 'در جریان' : 'در صف'}</span>
              {c.progress && <span className="pulse-progress" role="progressbar" aria-valuemin={0} aria-valuemax={c.progress.total} aria-valuenow={c.progress.done}><i style={{ inlineSize: `${Math.round((100 * c.progress.done) / Math.max(1, c.progress.total))}%` }} /><span>{faNum(c.progress.done)} از {faNum(c.progress.total)} روز</span></span>}
              {c.status === 'failed' && <span>{pulseErrorText(c.resultCode)}</span>}</span></li>)}</ul>}
        </div>
      </section>
    </div>
  );
}

/** Dealer code, user name and the write-only password («ثبت شده · تغییر»). */
function CredentialsForm({ s, busy, onSave }: { s: PulseStatus; busy: boolean; onSave: (body: unknown) => Promise<boolean> }) {
  const [dealerCode, setDealerCode] = useState(s.dealerCode ?? ''), [username, setUsername] = useState(s.username ?? '');
  const [password, setPassword] = useState(''), [changePassword, setChangePassword] = useState(!s.hasPassword);
  useEffect(() => { setDealerCode(s.dealerCode ?? ''); setUsername(s.username ?? ''); }, [s.dealerCode, s.username]);
  const ready = dealerCode.trim() && username.trim() && (!changePassword || password);
  async function save() {
    const ok = await onSave({ expectedVersion: s.version, dealerCode: toLatinDigits(dealerCode.trim()), username: username.trim(), ...(changePassword ? { password } : {}) });
    if (ok) { setPassword(''); setChangePassword(false); }
  }
  return (
    <section className="panel" aria-labelledby="pulse-credentials">
      <div className="panel-head"><div><h2 id="pulse-credentials">اطلاعات ورود کسب‌وکار</h2><p className="small muted">کلمه عبور رمزشده نگه‌داری می‌شود و هرگز به مرورگر برنمی‌گردد. ذخیرهٔ دوباره، توقف «خطای ورود» را برمی‌دارد.</p></div></div>
      <div className="panel-body stack">
        {!s.secretReady && <p className="callout callout-amber small">کلید رمزگذاری پالس (PULSE_SECRET_KEY) روی سرور تنظیم نشده است؛ تا تنظیم آن کلمه عبور ذخیره نمی‌شود.</p>}
        <div className="grid-2">
          <label className="field"><span>کد نمایندگی</span><input className="input ltr-input" inputMode="numeric" autoComplete="off" maxLength={16} value={dealerCode} onChange={(e) => setDealerCode(e.target.value)} /></label>
          <label className="field"><span>نام کاربری</span><input className="input ltr-input" autoComplete="off" maxLength={64} value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        </div>
        <p className="xs muted">دقیقاً همان سه مشخصهٔ صفحهٔ ورود کسب‌وکار. کد نمایندگی همان کد کامل بالای صفحهٔ کسب‌وکار است (مثلاً ۴۰۰۱۳۰۷، نه فقط ۱۳۰۷). اعداد فارسی خودکار به انگلیسی تبدیل می‌شوند. اگر ورود پذیرفته نشد، «جزئیات فنی» همان اجرا در جدول پایین کد پیام کسب‌وکار را نشان می‌دهد.</p>
        {changePassword
          ? <label className="field"><span>کلمه عبور</span><input className="input ltr-input" type="password" autoComplete="new-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          : <p className="small">کلمه عبور: <span className="m-tag ok">ثبت شده</span> <button type="button" className="btn btn-sm btn-ghost" onClick={() => setChangePassword(true)}>تغییر</button></p>}
        <div className="row"><button type="button" className="btn btn-primary" disabled={busy || !ready} onClick={() => void save()}>ذخیرهٔ اطلاعات ورود</button>{changePassword && s.hasPassword && <button type="button" className="btn btn-ghost" onClick={() => { setChangePassword(false); setPassword(''); }}>انصراف</button>}</div>
      </div>
    </section>
  );
}

/** Reading interval (minimum 2 minutes), working hours and the window of open admissions. */
function SettingsForm({ s, busy, onSave }: { s: PulseStatus; busy: boolean; onSave: (body: unknown) => Promise<boolean> }) {
  const [interval, setIntervalText] = useState(String(s.settings.intervalMinutes)), [mode, setMode] = useState(s.settings.hoursMode);
  const [from, setFrom] = useState(s.settings.hoursFrom), [to, setTo] = useState(s.settings.hoursTo), [days, setDays] = useState(String(s.settings.openWindowDays));
  const n = (v: string) => Number(toLatinDigits(v) || 0);
  return (
    <section className="panel" aria-labelledby="pulse-settings">
      <div className="panel-head"><h2 id="pulse-settings">زمان‌بندی خواندن</h2></div>
      <div className="panel-body stack">
        <div className="grid-2">
          <label className="field"><span>فاصلهٔ خواندن پذیرش‌های امروز (دقیقه، حداقل ۲)</span><input className="input" inputMode="numeric" value={interval} onChange={(e) => setIntervalText(e.target.value.replace(/[^0-9۰-۹]/g, '').slice(0, 2))} /></label>
          <label className="field"><span>بازهٔ پذیرش‌های باز (روز)</span><input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9۰-۹]/g, '').slice(0, 3))} /></label>
        </div>
        <label className="field"><span>ساعات کار</span><select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'calendar' | 'custom')}><option value="calendar">از تقویم نمایندگی (یک ساعت قبل از شروع تا یک ساعت بعد از پایان)</option><option value="custom">ساعت دلخواه در روزهای کاری</option></select></label>
        {mode === 'custom' && <div className="grid-2"><label className="field"><span>از ساعت</span><input className="input ltr-input" placeholder="07:00" value={from} onChange={(e) => setFrom(toLatinDigits(e.target.value).slice(0, 5))} /></label><label className="field"><span>تا ساعت</span><input className="input ltr-input" placeholder="19:00" value={to} onChange={(e) => setTo(toLatinDigits(e.target.value).slice(0, 5))} /></label></div>}
        <p className="xs muted">پذیرش‌های باز هر ۱۵ دقیقه، قطعات کارت‌های امروز هر ۱۰ دقیقه و کارت‌های قدیمی‌تر هر ۳۰ دقیقه خوانده می‌شوند؛ کارت تازه یا تغییرکرده بی‌درنگ.</p>
        <div className="row"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSave({ expectedVersion: s.version, intervalMinutes: n(interval), hoursMode: mode, hoursFrom: from, hoursTo: to, openWindowDays: n(days) })}>ذخیرهٔ زمان‌بندی</button></div>
      </div>
    </section>
  );
}

/** «بارگذاری اولیه از تاریخ …»: day by day, with a progress bar in the run list. */
function BackfillForm({ s, busy, onStart }: { s: PulseStatus; busy: boolean; onStart: (from: string) => Promise<boolean> }) {
  // Filled in (not only a grey hint): the first day of the month two months ago, Tehran time.
  const [from, setFrom] = useState(() => {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
    const y = Number(parts.find((p) => p.type === 'year')?.value), m = Number(parts.find((p) => p.type === 'month')?.value);
    if (!y || !m) return '';
    const back = m - 2 > 0 ? { y, m: m - 2 } : { y: y - 1, m: m + 10 };
    return `${back.y}/${String(back.m).padStart(2, '0')}/01`;
  });
  const last = s.commands.find((c) => c.kind === 'backfill');
  return (
    <section className="panel" aria-labelledby="pulse-backfill">
      <div className="panel-head"><div><h2 id="pulse-backfill">بارگذاری اولیه</h2><p className="small muted">یک بار، روزبه‌روز از تاریخ انتخابی تا امروز؛ با همان محدودیت سرعت و فقط‌خواندنی.</p></div></div>
      <div className="panel-body row">
        <label className="field"><span>از تاریخ (شمسی)</span><input className="input ltr-input" placeholder="1405/07/01" value={from} onChange={(e) => setFrom(toLatinDigits(e.target.value).slice(0, 10))} /></label>
        <button type="button" className="btn" disabled={busy || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(from)} onClick={() => void onStart(from)}>شروع بارگذاری اولیه</button>
        {last?.status === 'done' && <span className="small muted">آخرین بارگذاری اولیه: {formatJalali(last.finishedAt ?? last.createdAt, { time: true })}</span>}
      </div>
    </section>
  );
}

/** The captcha of کسب‌وکار: the worker is stopped until the administrator types the digits. */
function CaptchaBox({ image, busy, onAnswer }: { image: string; busy: boolean; onAnswer: (answer: string) => Promise<boolean> }) {
  const [answer, setAnswer] = useState('');
  const safe = /^data:image\/(png|jpe?g|gif|bmp|webp);base64,[A-Za-z0-9+/=]+$/.test(image);
  return (
    <section className="panel pulse-captcha" aria-labelledby="pulse-captcha">
      <div className="panel-head"><div><h2 id="pulse-captcha">کد امنیتی کسب‌وکار</h2><p className="small muted">کسب‌وکار کد امنیتی خواست و پالس متوقف شد. عدد تصویر را وارد کنید؛ پالس فقط یک بار دوباره وارد می‌شود.</p></div></div>
      <div className="panel-body row">
        {safe ? <img src={image} alt="تصویر کد امنیتی کسب‌وکار" className="pulse-captcha-img" /> : <p className="callout callout-red small">تصویر کد امنیتی قالب شناخته‌شده‌ای ندارد.</p>}
        <label className="field"><span>عدد تصویر</span><input className="input ltr-input" inputMode="numeric" autoComplete="off" maxLength={8} value={answer} onChange={(e) => setAnswer(e.target.value.replace(/[^0-9۰-۹]/g, ''))} /></label>
        <button type="button" className="btn btn-primary" disabled={busy || answer.length < 3} onClick={() => void onAnswer(answer).then((ok) => ok && setAnswer(''))}>ورود با این کد</button>
      </div>
    </section>
  );
}
