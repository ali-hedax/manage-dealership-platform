'use client';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import type { ReportCenterEntry } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { ReportUpload } from '@/components/ReportUpload';

/** «مرکز گزارش‌های کسب‌وکار»: the three ISACO reports, their guide, period and last import in one place. */
export default function ReportCenterPage() {
  const { can } = useAuth();
  const { data, error, mutate } = useSWR<ReportCenterEntry[]>('/report-center', fetcher);
  return (
    <div className="stack">
      <header className="unit-header"><div><h1>مرکز گزارش‌های کسب‌وکار</h1><p className="muted">سه گزارش ایساکو، یک پایهٔ دادهٔ مشترک. ورود هر فایل از محتوا و سربرگ تأییدشده شناخته می‌شود، نه از نام فایل؛ بارگذاری دوباره چیز تکراری نمی‌سازد و نبودِ یک ردیف به معنای ابطال نیست.</p></div></header>
      {error && <p className="callout callout-red small" role="alert">{errorMessage(error)}</p>}
      {!data && !error && <p className="muted small" role="status">در حال خواندن…</p>}
      {(can('daily_reports.upload') || can('reference.customers.manage') || can('reference.appointments.manage')) && <ReportUpload onDone={() => void mutate()} />}
      {data?.map((e) => <ReportCard key={e.kind} e={e} editable={can('report_center.manage')} onSaved={(next) => void mutate(next, { revalidate: false })} />)}
    </div>
  );
}

function ReportCard({ e, editable, onSaved }: { e: ReportCenterEntry; editable: boolean; onSaved: (n: ReportCenterEntry[]) => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState(false), [guide, setGuide] = useState(e.guide), [past, setPast] = useState(String(e.pastDays)), [future, setFuture] = useState(String(e.futureDays)), [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { onSaved(await api<ReportCenterEntry[]>('/report-center', { method: 'PUT', body: { kind: e.kind, guide, pastDays: Number(past), futureDays: Number(future) } })); toast('راهنما ذخیره شد'); setEdit(false); }
    catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  }
  return (
    <section className="panel" aria-labelledby={`rc-${e.kind}`}>
      <div className="panel-head"><div><h2 id={`rc-${e.kind}`}>{e.title}</h2><p className="muted small">ایساکو: {e.isacoPath} · بازهٔ پیش‌فرض: {e.kind === 'appointments' ? `${faNum(e.pastDays)} روز گذشته تا ${faNum(e.futureDays)} روز آینده` : e.period}</p></div>
        <div className="row no-print">{e.uploadHref && <Link className="btn btn-sm btn-primary" href={e.uploadHref}>بارگذاری</Link>}{editable && !edit && <button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>ویرایش راهنما</button>}</div></div>
      <div className="panel-body stack">
        {e.lastImport ? <p className="small">آخرین ورود موفق: {formatJalali(e.lastImport.appliedAt, { time: true })}{e.lastImport.reportAt && ` · تاریخ گزارش ${formatJalali(e.lastImport.reportAt)}`} · {e.lastImport.fileName}{e.lastImport.rows != null && ` · ${faNum(e.lastImport.rows)} ردیف`}{!!e.lastImport.errors && ` · ${faNum(e.lastImport.errors)} ردیف نیازمند بررسی`}</p> : null}
        {e.lastImport && <p className="small">{e.stale ? <span className="m-tag wait">قدیمی</span> : <span className="m-tag ok">به‌روز</span>} {e.ageWorkingDays === 0 ? 'امروز وارد شده' : `${faNum(e.ageWorkingDays ?? 0)} روز کاری از آخرین ورود`}{!e.layoutConfirmed && ' · ستون‌ها هنوز تأیید نشده'}</p>}
        {!e.lastImport && <p className="callout callout-amber small">هنوز ورودی ثبت نشده؛ داده‌های وابسته به این گزارش نمایش داده نمی‌شوند.{!e.layoutConfirmed && e.kind !== 'emdad' && ' بار اول ستون‌ها را در «اطلاعات پایه» یک‌بار تأیید کنید.'}</p>}
        {e.missingDays.length > 0 && <p className="callout callout-amber small">روزهای کاری بدون گزارش در دو هفتهٔ اخیر: {e.missingDays.map((d) => formatJalali(`${d}T08:30:00Z`)).join('، ')}</p>}
        {edit ? <div className="stack">
          <label className="field"><span>راهنمای فارسی (مسیر، صافی‌ها، خروجی و بارگذاری)</span><textarea className="input" rows={7} maxLength={4000} value={guide} onChange={(x) => setGuide(x.target.value)} /></label>
          <div className="grid-2"><label className="field"><span>روزهای گذشتهٔ بازه</span><input className="input" inputMode="numeric" value={past} onChange={(x) => setPast(x.target.value.replace(/\D/g, '').slice(0, 3))} /></label><label className="field"><span>روزهای آیندهٔ بازه</span><input className="input" inputMode="numeric" value={future} onChange={(x) => setFuture(x.target.value.replace(/\D/g, '').slice(0, 2))} /></label></div>
          <div className="row"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => { setEdit(false); setGuide(e.guide); }}>انصراف</button></div>
        </div> : <details><summary className="small">راهنمای گام‌به‌گام</summary><p className="small" style={{ whiteSpace: 'pre-line' }}>{e.guide}</p>{e.updatedAt && <p className="xs muted">آخرین ویرایش {formatJalali(e.updatedAt)}</p>}</details>}
      </div>
    </section>
  );
}
