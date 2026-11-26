'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import {
  formatJalali, toPersianDigits, STOPPAGE_REASON_LABELS, STOPPAGE_STAGE_LABELS, STOPPAGE_STAGES,
  type StoppageCaseView, type StoppageImportPreview, type StoppageImportResult, type StoppageItemView, type StoppageListKind,
  type StoppageListView, type StoppageReport, type StoppageStage, type StoppageSummary,
} from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { AppIcon } from './AppIcon';
import { EmptyState } from './EmptyState';

// «خودروهای متوقف» (owner, 2026-11-26; reconstruction step 1A): every active stoppage of the official
// «گزارش توقف خودرو» of کسب‌وکار as a followed-up case — vehicle card, locked stepper of the official
// stages, each part line with its status, and the follow-up owner. Ended stoppages go to the archive.

const VIEW_LABELS: Record<StoppageListKind, string> = { active: 'متوقف‌های فعال', review: 'نیازمند بررسی', archive: 'بایگانی (خاتمه‌یافته)' };
const ISACO_PATH = 'بازرگانی ← گزارش ← گزارشات انبار ← گزارش توقف خودرو';
const VALIDATING = 'نسخهٔ اول · در حال اعتبارسنجی با گزارش واقعی';

function Freshness({ last, stale }: { last: StoppageListView['lastImport']; stale: boolean }) {
  if (!last) return <span className="m-tag stop">هنوز گزارشی وارد نشده</span>;
  return <span className={`m-tag ${stale ? 'wait' : 'ok'}`} title={last.fileName}>آخرین به‌روزرسانی: {formatJalali(last.at, { time: true })}{stale ? ' · قدیمی' : ''}</span>;
}

const edge = (s: Pick<StoppageSummary, 'active' | 'daysStopped' | 'review'>) => (!s.active ? 'done' : s.review.length ? 'review' : (s.daysStopped ?? 0) > 14 ? 'late' : 'ok');

function VehicleCard({ s }: { s: StoppageSummary }) {
  return (
    <Link href={`/reception/stoppage/${s.id}`} className={`stp-card stp-edge-${edge(s)}`}>
      <div className="stp-card-top">
        <strong className="stp-car">{s.vehicleName}</strong>
        <bdi dir="ltr" className="stp-vin">{s.chassis}</bdi>
        {s.daysStopped !== null && <span className="m-tag mute">روز {faNum(s.daysStopped)}</span>}
      </div>
      <p className="stp-who">{s.ownerName ?? 'نامشخص'} · {STOPPAGE_STAGE_LABELS[s.stage]}</p>
      <p className="stp-reasons">{s.reasons.map((r) => STOPPAGE_REASON_LABELS[r]).join('، ')} · {faNum(s.activeItems)} از {faNum(s.items)} ردیف باز</p>
      {s.review.length > 0 && <p className="stp-review">{s.review[0]}{s.review.length > 1 ? ` (+${faNum(s.review.length - 1)})` : ''}</p>}
      <p className="stp-ids">اعلام توقف {toPersianDigits(s.noticeNo)} · {s.reception?.admissionNo ? `پذیرش ${toPersianDigits(s.reception.admissionNo)}` : 'پذیرش نامشخص'}{s.followUpName ? ` · پیگیر: ${s.followUpName}` : ''}</p>
    </Link>
  );
}

export function StoppageList() {
  const { can } = useAuth();
  const router = useRouter();
  const view = (useSearchParams().get('view') as StoppageListKind | null) ?? 'active';
  const [q, setQ] = useState('');
  const allowed = can('stoppage.read');
  const { data, error, mutate } = useSWR<StoppageListView>(allowed ? `/stoppages?view=${view}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}` : null, fetcher, { refreshInterval: 120_000 });
  if (!allowed) return <EmptyState heading="h1" icon="lock" title="خودروهای متوقف">برای این بخش مجوز ندارید.</EmptyState>;
  const today = data?.counts.active;
  return (
    <section className="desk stp-desk" aria-labelledby="stp-title">
      <header className="desk-head">
        <div className="desk-hello">
          <h1 id="stp-title">خودروهای متوقف</h1>
          <p className="desk-sub">{data ? (today ? `امروز ${faNum(today)} خودرو در گزارش رسمی توقف فعال دارند.` : 'هیچ توقف فعالی در آخرین گزارش نیست.') : 'در حال خواندن…'}</p>
          <p className="row stp-badges">{data && <Freshness last={data.lastImport} stale={data.stale} />}<span className="m-tag em">{VALIDATING}</span></p>
        </div>
        <div className="row no-print">
          {can('report.manager') && <Link className="btn btn-sm" href="/control-room/stoppages"><AppIcon name="chart" />گزارش مدیریتی</Link>}
          <Link className="btn btn-sm btn-ghost" href="/reception/night">لیست شب</Link>
        </div>
      </header>
      {can('stoppage.import') && <StoppageUpload onDone={() => void mutate()} />}
      <nav className="segmented stp-tabs" aria-label="نمای خودروهای متوقف">
        {(Object.keys(VIEW_LABELS) as StoppageListKind[]).map((v) => (
          <button key={v} type="button" className={`seg${v === view ? ' on' : ''}`} aria-pressed={v === view} onClick={() => router.replace(`/reception/stoppage${v === 'active' ? '' : `?view=${v}`}`)}>
            {VIEW_LABELS[v]}{data ? ` (${faNum(data.counts[v])})` : ''}
          </button>
        ))}
      </nav>
      <label className="m-search stp-search"><AppIcon name="search" /><input className="input" type="search" placeholder="شاسی، شمارهٔ اعلام، نام مالک یا شمارهٔ پذیرش" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {error && <p className="m-error" role="alert">{errorMessage(error)}</p>}
      {!data && !error && <div className="stp-grid" aria-busy="true">{[1, 2, 3].map((i) => <div key={i} className="stp-card stp-skel" />)}</div>}
      {data && !data.items.length && <p className="m-empty">{q ? 'موردی با این جست‌وجو پیدا نشد.' : view === 'review' ? 'موردی برای بررسی نیست.' : view === 'archive' ? 'هنوز توقفی خاتمه نیافته است.' : data.lastImport ? 'هیچ خودرویی توقف فعال ندارد.' : 'برای شروع، گزارش توقف خودرو را از کسب‌وکار بگیرید و همین‌جا بارگذاری کنید.'}</p>}
      {data && data.items.length > 0 && <div className="stp-grid">{data.items.map((s) => <VehicleCard key={s.id} s={s} />)}</div>}
    </section>
  );
}

/** Two steps: preview (nothing is written), then apply the same file with its SHA-256. */
export function StoppageUpload({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StoppageImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const post = async (f: File, query: string) => {
    const res = await fetch(`/api/v1/stoppages/import?fileName=${encodeURIComponent(f.name)}${query}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-manage-client': 'web', 'content-type': 'application/octet-stream' }, body: f });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message ?? 'بارگذاری انجام نشد');
    return body;
  };
  const choose = async (f: File | null) => {
    setFile(f); setPreview(null); setMessage('');
    if (!f) return;
    setBusy(true);
    try { setPreview(await post(f, '') as StoppageImportPreview); } catch (e) { setMessage(errorMessage(e)); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!file || !preview) return;
    setBusy(true);
    try {
      const r = await post(file, `&confirm=${preview.fileHash}${preview.needsAcceptance ? '&acceptWarnings=true' : ''}`) as StoppageImportResult;
      setMessage(r.duplicate ? 'این فایل قبلاً ثبت شده بود؛ چیزی تغییر نکرد.' : 'گزارش توقف ثبت شد.');
      setPreview(null); setFile(null); onDone();
    } catch (e) { setMessage(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <>
    <details className="panel stp-upload no-print" open={!!preview}>
      <summary><AppIcon name="upload" /> بارگذاری گزارش توقف خودرو (Excel)</summary>
      <div className="panel-body stack">
        <p className="small muted">مسیر در کسب‌وکار: <b>{ISACO_PATH}</b>. بازهٔ تاریخ را از یک ماه گذشته تا امروز بگذارید، خروجی Excel بگیرید و فایل را بدون ویرایش این‌جا بیندازید. منیج اول پیش‌نمایش نشان می‌دهد و تا تأیید نکنید چیزی ثبت نمی‌شود.</p>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(e) => void choose(e.target.files?.[0] ?? null)} aria-label="فایل گزارش توقف خودرو" />
        {busy && <p role="status">در حال خواندن فایل…</p>}
        {preview && (
          <div className="stack">
            {preview.blocked ? <p className="callout callout-red" role="alert">{preview.blocked}</p> : (
              <>
                <p className="small">{faNum(preview.rows)} ردیف · {faNum(preview.stoppages)} اعلام توقف · {faNum(preview.activeStoppages)} توقف فعال · {faNum(preview.newRows)} ردیف تازه · {faNum(preview.changedRows)} تغییر · {faNum(preview.unchangedRows)} بدون تغییر{preview.missingFromFile ? ` · ${faNum(preview.missingFromFile)} ردیف فعالِ قبلی در این فایل نیست (با وضعیت قبلی می‌ماند)` : ''}</p>
                {preview.duplicate && <p className="callout callout-blue small">این همان فایلی است که قبلاً ثبت شده؛ ثبت دوباره چیزی را تغییر نمی‌دهد.</p>}
                {preview.warnings.map((w) => <p key={w} className="callout callout-amber small">{w}</p>)}
                {preview.errors.length > 0 && <details><summary className="small">ردیف‌های خوانده‌نشده ({faNum(preview.errors.length)})</summary><ul className="small">{preview.errors.map((e) => <li key={`${e.row}-${e.message}`}>ردیف {faNum(e.row)}: {e.message}</li>)}</ul></details>}
                {preview.rowNotes.length > 0 && <details><summary className="small">نکته‌های ردیف‌ها ({faNum(preview.rowNotes.length)})</summary><ul className="small">{preview.rowNotes.map((e) => <li key={`${e.row}-${e.message}`}>ردیف {faNum(e.row)}: {e.message}</li>)}</ul></details>}
                <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void apply()}>{preview.needsAcceptance ? 'با وجود هشدار ثبت شود' : 'ثبت گزارش'}</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPreview(null); setFile(null); }}>انصراف</button></div>
              </>
            )}
          </div>
        )}
      </div>
    </details>
    {/* Outside the panel: the panel folds after a successful import and the result must stay visible. */}
    {message && <p className="small no-print" role="status">{message}</p>}
    </>
  );
}

/** Locked stepper: done stages, the current one highlighted, later ones dimmed. */
function Stepper({ stage, item }: { stage: StoppageStage; item?: StoppageItemView }) {
  const at = stage === 'rejected' ? -1 : STOPPAGE_STAGES.indexOf(stage);
  const skipped = (s: StoppageStage) => item && ((s === 'sent_hq' && !item.dates.hq && at > STOPPAGE_STAGES.indexOf('sent_hq')) || (s === 'part_arrived' && item.reasonKind !== 'special_aid' && at > 2));
  return (
    <ol className="stp-steps" aria-label="مراحل توقف">
      {STOPPAGE_STAGES.map((s, i) => {
        const state = stage === 'rejected' ? 'locked' : i < at ? 'done' : i === at ? (s === 'ended' ? 'done' : 'now') : 'locked';
        return <li key={s} className={`stp-step ${skipped(s) ? 'skip' : state}`} aria-current={state === 'now' ? 'step' : undefined}>
          <span className="stp-dot" aria-hidden="true">{state === 'done' ? '✓' : faNum(i + 1)}</span>{STOPPAGE_STAGE_LABELS[s]}{skipped(s) ? ' (لازم نشد)' : ''}
        </li>;
      })}
      {stage === 'rejected' && <li className="stp-step now">{STOPPAGE_STAGE_LABELS.rejected}</li>}
    </ol>
  );
}

const dateText = (d: string | null) => d ? toPersianDigits(d) : '—';

export function StoppageCase({ id }: { id: string }) {
  const { can } = useAuth();
  const { data, error, mutate } = useSWR<StoppageCaseView>(can('stoppage.read') ? `/stoppages/${id}` : null, fetcher);
  const manage = can('stoppage.manage');
  const { data: followers } = useSWR<{ id: string; displayName: string }[]>(manage ? '/stoppages/followers' : null, fetcher);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!can('stoppage.read')) return <EmptyState heading="h1" icon="lock" title="خودروی متوقف">برای این بخش مجوز ندارید.</EmptyState>;
  if (error) return <p className="m-error" role="alert">{errorMessage(error)}</p>;
  if (!data) return <p role="status">در حال خواندن پرونده…</p>;
  const act = async (fn: () => Promise<StoppageCaseView>, done: string) => {
    setBusy(true); setMessage('');
    try { await mutate(await fn(), { revalidate: false }); setMessage(done); } catch (e) { setMessage(errorMessage(e)); } finally { setBusy(false); }
  };
  const holding = data.itemsList.find((i) => i.active && i.stage === data.stage) ?? data.itemsList[0];
  return (
    <section className="stack stp-case" aria-labelledby="stp-case-title">
      <header className={`panel stp-head stp-edge-${edge(data)}`}>
        <div className="stp-card-top">
          <h1 id="stp-case-title" className="stp-car">{data.vehicleName}</h1>
          <bdi dir="ltr" className="stp-vin">{data.chassis}</bdi>
          <span className={`m-tag ${data.active ? 'wait' : 'ok'}`}>{data.active ? 'توقف فعال' : 'خاتمه‌یافته'}</span>
          {data.daysStopped !== null && <span className="m-tag mute">روز {faNum(data.daysStopped)}</span>}
          {!data.inLastFile && <span className="m-tag stop" title="ردیف‌های این توقف در آخرین فایل نبودند؛ آخرین وضعیت دیده‌شده نمایش داده می‌شود">در آخرین گزارش نبود</span>}
        </div>
        <p className="stp-who">{data.ownerName ?? 'نامشخص'}{data.ownerPhone ? <> · <bdi dir="ltr">{data.ownerPhone}</bdi></> : null}{data.km ? ` · ${toPersianDigits(data.km)} کیلومتر` : ''}</p>
        <p className="stp-ids">اعلام توقف {toPersianDigits(data.noticeNo)} · {data.stoppedAt ? `از ${formatJalali(data.stoppedAt, { time: true })}` : 'تاریخ توقف نامشخص'}{data.endedAt ? ` تا ${formatJalali(data.endedAt)}` : ''}{data.daysOfficial !== null ? ` · مدت در گزارش: ${faNum(data.daysOfficial)} روز` : ''}</p>
        <details className="stp-spec"><summary>مشخصات کامل</summary><p className="small">{data.vehicleType ?? 'نامشخص'}</p>{data.cardStatus && <p className="small">وضعیت کارت در گزارش: {data.cardStatus}</p>}</details>
      </header>

      {data.review.length > 0 && <div className="callout callout-amber"><b>نیازمند بررسی</b><ul className="small">{data.review.map((r) => <li key={r}>{r}</li>)}</ul></div>}

      <section className="panel" aria-labelledby="stp-steps-h">
        <div className="panel-head"><h2 id="stp-steps-h">مرحلهٔ فعلی: {STOPPAGE_STAGE_LABELS[data.stage]}</h2></div>
        <div className="panel-body"><Stepper stage={data.stage} item={holding} /></div>
      </section>

      <section className="panel" aria-labelledby="stp-items-h">
        <div className="panel-head"><h2 id="stp-items-h">ردیف‌های توقف ({faNum(data.itemsList.length)})</h2></div>
        <ul className="panel-body stp-items">
          {data.itemsList.map((i) => (
            <li key={i.id} className={`stp-item ${i.active ? 'open' : 'closed'}`}>
              <div className="stp-item-top">
                <strong>{i.partName ?? STOPPAGE_REASON_LABELS[i.reasonKind]}</strong>
                {i.partCode && <bdi dir="ltr" className="stp-code">{i.partCode}</bdi>}
                <span className={`m-tag ${i.statusKnown ? (i.active ? 'wait' : 'ok') : 'stop'}`}>{i.status || 'وضعیت خالی'}</span>
                <span className="m-tag mute">{STOPPAGE_STAGE_LABELS[i.stage]}</span>
              </div>
              <p className="small">{i.reason} · شمارهٔ مرجع <bdi dir="ltr">{i.referenceNo}</bdi>{i.daysOfficial !== null ? ` · ${faNum(i.daysOfficial)} روز در گزارش` : ''}{i.dealerDelay ? ` · تأخیر نمایندگی: ${i.dealerDelay}` : ''}</p>
              <p className="xs muted">ایجاد {dateText(i.dates.created)} · دفتر {dateText(i.dates.office)} · ستاد {dateText(i.dates.hq)} · خاتمه {dateText(i.dates.ended)}{i.dates.rejected ? ` · رد ${dateText(i.dates.rejected)}` : ''}</p>
              {i.specialAid && <p className="small">امداد ویژه <bdi dir="ltr">{i.specialAid.emdadNo}</bdi>: {i.specialAid.link === 'linked' ? (i.specialAid.status ?? 'وضعیت نامشخص') : i.specialAid.link === 'ambiguous' ? 'چند ردیف مشابه؛ نیازمند بررسی' : 'در گزارش امداد ویژهٔ منیج پیدا نشد'}{i.specialAid.arrived ? ' · قطعه رسیده' : ''}</p>}
              {i.notes.length > 0 && <p className="xs stp-review">{i.notes.join(' · ')}</p>}
              {!i.inLastFile && <p className="xs muted">در آخرین فایل نبود؛ آخرین وضعیت دیده‌شده.</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="stp-follow-h">
        <div className="panel-head"><h2 id="stp-follow-h">پیگیری و پذیرش</h2></div>
        <div className="panel-body stack">
          <label className="field">پیگیر این خودرو
            {manage ? <select className="input" value={data.followUpUserId ?? ''} disabled={busy} onChange={(e) => void act(() => api(`/stoppages/${data.id}/follow-up`, { method: 'PATCH', body: { expectedVersion: data.version, ownerUserId: e.target.value || null } }), 'پیگیر ثبت شد.')}>
              <option value="">— بدون پیگیر —</option>
              {(followers ?? []).map((f) => <option key={f.id} value={f.id}>{f.displayName}</option>)}
            </select> : <span>{data.followUpName ?? 'تعیین نشده'}</span>}
          </label>
          <p className="small">پذیرش: {data.reception ? <Link href={`/reception/${data.reception.id}`}>{data.reception.admissionNo ? toPersianDigits(data.reception.admissionNo) : 'باز کردن پذیرش'}</Link> : 'نامشخص'}{data.linkState === 'manual' ? ' (انتخاب دستی)' : data.linkState === 'linked' ? ' (خودکار با شاسی و تاریخ)' : ''}</p>
          {manage && data.candidates.length > 0 && (
            <div className="stack">
              <label className="field">دلیل انتخاب پذیرش<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: پذیرش همان روز توقف" /></label>
              <ul className="stp-cands">
                {data.candidates.map((c) => (
                  <li key={c.id} className="row">
                    <span>پذیرش {c.admissionNo ? toPersianDigits(c.admissionNo) : 'بدون شماره'} · {c.admittedAt ? formatJalali(c.admittedAt, { time: true }) : 'تاریخ نامشخص'} · {c.isOpen ? 'باز' : c.releasedAt ? `ترخیص ${formatJalali(c.releasedAt)}` : 'بسته'}</span>
                    <button type="button" className="btn btn-sm" disabled={busy || reason.trim().length < 3 || data.reception?.id === c.id} onClick={() => void act(() => api(`/stoppages/${data.id}/reception`, { body: { expectedVersion: data.version, receptionId: c.id, reason } }), 'پذیرش انتخاب شد.')}>همین پذیرش</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {message && <p className="small" role="status">{message}</p>}
        </div>
      </section>

      <details className="panel stp-history">
        <summary>سابقهٔ تغییرات در گزارش‌ها ({faNum(data.history.length)})</summary>
        <ul className="panel-body small">
          {data.history.map((h, n) => <li key={`${h.at}-${n}`}><b>{formatJalali(h.at, { time: true })}</b> · {h.rowKey}<br />{h.changes.join(' · ')}</li>)}
        </ul>
      </details>
    </section>
  );
}

export function StoppageReportView() {
  const { can } = useAuth();
  const allowed = can('stoppage.read') && can('report.manager');
  const { data, error } = useSWR<StoppageReport>(allowed ? '/stoppages/report' : null, fetcher, { refreshInterval: 300_000 });
  if (!allowed) return <EmptyState heading="h1" icon="lock" title="گزارش خودروهای متوقف">این گزارش برای مدیران است.</EmptyState>;
  if (error) return <p className="m-error" role="alert">{errorMessage(error)}</p>;
  if (!data) return <p role="status">در حال خواندن گزارش…</p>;
  const max = Math.max(1, ...data.ageing.map((a) => a.count));
  return (
    <section className="stack stp-report" aria-labelledby="stp-report-h">
      <header className="desk-head">
        <div className="desk-hello">
          <h1 id="stp-report-h">خودروهای متوقف · گزارش مدیریتی</h1>
          <p className="desk-sub">{data.active ? `${faNum(data.active)} خودرو توقف رسمی فعال دارند${data.maxDays !== null ? `؛ طولانی‌ترین ${faNum(data.maxDays)} روز` : ''}.` : 'هیچ توقف رسمی فعالی نیست.'}</p>
          <p className="row stp-badges"><Freshness last={data.lastImport} stale={data.stale} /><span className="m-tag em">{VALIDATING}</span></p>
        </div>
        <Link className="btn btn-sm" href="/reception/stoppage">فهرست خودروها</Link>
      </header>
      <div className="stp-kpis">
        <Link className="stp-kpi" href="/reception/stoppage"><b>{faNum(data.active)}</b><span>توقف فعال</span></Link>
        <div className="stp-kpi"><b>{data.avgDays === null ? 'نامشخص' : faNum(data.avgDays)}</b><span>میانگین روز توقف</span></div>
        <div className="stp-kpi"><b>{data.maxDays === null ? 'نامشخص' : faNum(data.maxDays)}</b><span>بیشترین روز توقف</span></div>
        <Link className="stp-kpi" href="/reception/stoppage?view=review"><b>{faNum(data.longest.filter((s) => s.review.length).length)}</b><span>نیازمند بررسی (از ۱۰ مورد اول)</span></Link>
      </div>
      <div className="stp-cols">
        <section className="panel"><div className="panel-head"><h2>بر اساس علت</h2></div><ul className="panel-body stp-bars">{data.byReason.map((r) => <li key={r.kind}><span>{r.label}</span><b>{faNum(r.count)}</b></li>)}</ul></section>
        <section className="panel"><div className="panel-head"><h2>بر اساس مرحله</h2></div><ul className="panel-body stp-bars">{data.byStage.map((r) => <li key={r.stage}><span>{r.label}</span><b>{faNum(r.count)}</b></li>)}</ul></section>
        <section className="panel"><div className="panel-head"><h2>سن توقف</h2></div><ul className="panel-body stp-bars">{data.ageing.map((a) => <li key={a.key}><span>{a.label}</span><i style={{ inlineSize: `${(a.count / max) * 100}%` }} aria-hidden="true" /><b>{faNum(a.count)}</b></li>)}</ul></section>
        <section className="panel"><div className="panel-head"><h2>مقایسه با لیست شب</h2></div><div className="panel-body small">
          {data.overlap.day ? <>
            <p>لیست شب {formatJalali(data.overlap.day + 'T12:00:00Z')}:</p>
            <ul className="stp-bars"><li><span>در هر دو</span><b>{faNum(data.overlap.both)}</b></li><li><span>فقط توقف رسمی</span><b>{faNum(data.overlap.officialOnly)}</b></li><li><span>فقط لیست شب</span><b>{faNum(data.overlap.nightOnly)}</b></li></ul>
            <p className="xs muted">مقایسه با پذیرشِ وصل‌شده به هر توقف انجام می‌شود؛ توقف بدون پذیرش در «فقط توقف رسمی» شمرده می‌شود.</p>
          </> : <p>هنوز لیست شبی ساخته نشده است.</p>}
        </div></section>
      </div>
      <section className="panel"><div className="panel-head"><h2>طولانی‌ترین توقف‌ها</h2></div>
        <div className="panel-body stp-grid">{data.longest.length ? data.longest.map((s) => <VehicleCard key={s.id} s={s} />) : <p className="m-empty">موردی نیست.</p>}</div>
      </section>
    </section>
  );
}
