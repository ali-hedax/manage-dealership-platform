'use client';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import {
  KASB_FIELD_DEFS, KASB_FIELD_KEYS, KASB_FIELD_LIST_LABELS, pulseErrorText,
  type DataSourceEntry, type DataSourceRead, type DataSourcesView, type KasbFieldCoverage, type KasbFieldKey, type KasbFieldMap, type ReceptionImportPreview, type StoppageColumnsPreview,
} from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { AppIcon } from '@/components/AppIcon';
import { EmptyState } from '@/components/EmptyState';

const MODE = { auto: 'خودکار با پالس', manual: 'دستی' } as const;
const ERRORS: Record<string, string> = { RECEPTION_IMPORT_ROWS: 'چند ردیف فایل خوانده نشد' };
const errorText = (code: string | null) => (code ? ERRORS[code] ?? pulseErrorText(code) : null);
const readText = (r: DataSourceRead) => `${formatJalali(r.at, { time: true })} · ${MODE[r.mode]}${r.rows != null ? ` · ${faNum(r.rows)} ردیف` : ''}`;

async function b64(f: File) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * «منبع‌ها» (data foundation S07/S08, owner 2026-11-28): for the system administrator, every report
 * Manage takes from کسب‌وکار — when it was last read, automatically or by hand, how many rows, whether
 * it failed — whether Pulse is reading now, and the step-by-step way to get each report by hand when
 * it is not. Below: how complete the repair-card data is, the columns still to confirm, and the manual
 * «پذیرش و ریز کارت» upload.
 */
export default function SourcesPage() {
  const { can } = useAuth();
  const allowed = can('integration.manage');
  const { data, error, mutate } = useSWR<DataSourcesView>(allowed ? '/pulse/sources' : null, fetcher, { refreshInterval: 60_000 });
  if (!allowed) return <EmptyState icon="lock" title="منبع‌ها" heading="h1">این صفحه برای مالک و مدیر سیستم است.</EmptyState>;
  return (
    <div className="stack nexus" data-testid="sources-page">
      <header className="nexus-head">
        <span className="nexus-mark" aria-hidden="true"><AppIcon name="layers" /></span>
        <div><h1>منبع‌ها</h1><p>هر گزارشی که منیج از کسب‌وکار می‌خواند: آخرین خواندن، خودکار یا دستی، تعداد ردیف و خطا</p></div>
      </header>
      {error && <p className="callout callout-red small" role="alert">{errorMessage(error)}</p>}
      {!data && !error && <p className="muted small">در حال خواندن…</p>}
      {data && <>
        <PulseBanner view={data} />
        <section className="panel" aria-labelledby="src-list">
          <div className="panel-head"><div><h2 id="src-list">گزارش‌ها</h2><p className="small muted">«کهنه» یعنی در بازهٔ مورد انتظار هیچ خواندن موفقی نبوده است. راهنمای هر گزارش برای وقتی است که پالس قطع است.</p></div>
            <div className="row no-print"><Link className="btn btn-sm" href="/settings/pulse"><AppIcon name="gear" />اتصال و تنظیمات پالس</Link><Link className="btn btn-sm btn-ghost" href="/settings/nexus">Manage Nexus</Link></div></div>
          <div className="panel-body nexus-list">
            {data.sources.map((s) => <SourceRow key={s.key} source={s} openGuide={!data.pulse.live} failedLineCards={s.key === 'lines' ? data.failedLineCards : 0} />)}
          </div>
        </section>
        <Coverage coverage={data.coverage} />
        <FieldMap view={data} onSaved={(v) => void mutate(v, { revalidate: false })} />
        <ManualReception onDone={() => void mutate()} />
        <StoppageColumns />
      </>}
    </div>
  );
}

function PulseBanner({ view }: { view: DataSourcesView }) {
  const p = view.pulse;
  if (p.live) {
    return <p className="callout callout-blue small" role="status" data-testid="pulse-live">
      پالس در حال خواندن است{p.lastReadAt ? ` · آخرین خواندن پذیرش‌ها: ${formatJalali(p.lastReadAt, { time: true })}` : ''}{p.withinWorkingHours ? '' : ' · بیرون از ساعت کاری، پالس نمی‌خواند'}
    </p>;
  }
  return <div className="callout callout-red small" role="alert" data-testid="pulse-down">
    <strong>پالس قطع است.</strong> {p.reason}
    <br />تا برگشتن پالس، هر گزارش را با راهنمای قدم‌به‌قدم زیرِ همان گزارش از کسب‌وکار بگیرید و دستی بارگذاری کنید. پذیرش‌ها و ریز کارت از «بارگذاری دستی پذیرش و ریز کارت» پایین همین صفحه وارد می‌شوند.
  </div>;
}

function SourceRow({ source: s, openGuide, failedLineCards }: { source: DataSourceEntry; openGuide: boolean; failedLineCards: number }) {
  const failed = s.lastRead && !s.lastRead.ok ? s.lastRead : null;
  return (
    <article className="nexus-row" data-testid={`source-${s.key}`}>
      <div className="nexus-row-top">
        <div className="nexus-row-name"><strong>{s.title}</strong>
          {s.modes.map((m) => <span key={m} className={`m-tag ${m === 'auto' ? 'ok' : 'wait'}`}>{MODE[m]}</span>)}
          {s.stale ? <span className="m-tag stop">کهنه</span> : s.lastSuccess ? <span className="m-tag ok">به‌روز</span> : null}
          {failed && <span className="m-tag stop">خطا</span>}
        </div>
        {s.manualHref && <div className="row no-print"><Link className="btn btn-sm btn-ghost" href={s.manualHref}><AppIcon name="upload" />بارگذاری دستی</Link></div>}
      </div>
      <p className="small">{s.lastSuccess ? `آخرین خواندن موفق: ${readText(s.lastSuccess)}` : 'هنوز هیچ خواندن موفقی ثبت نشده است.'}</p>
      <p className="small muted">
        {s.lastAuto ? `پالس: ${formatJalali(s.lastAuto.at, { time: true })}${s.lastAuto.ok ? '' : ` — ناموفق: ${errorText(s.lastAuto.errorCode) ?? ''}`}` : s.modes.includes('auto') ? 'پالس: هنوز نخوانده' : 'فقط دستی'}
        {' · '}{s.lastManual ? `دستی: ${formatJalali(s.lastManual.at, { time: true })}${s.lastManual.errorCode ? ` (${errorText(s.lastManual.errorCode)})` : ''}` : 'دستی: هنوز بارگذاری نشده'}
        {' · '}{s.rhythm}
      </p>
      {failedLineCards > 0 && <p className="small">{faNum(failedLineCards)} کارت که کسب‌وکار ریز آن را نداد؛ هر کدام در نوبت خودش دوباره خوانده می‌شود و کارت‌های دیگر منتظر آن نمی‌مانند.</p>}
      <details className="nexus-guide" open={openGuide}><summary>راهنمای گرفتن دستی این گزارش از کسب‌وکار</summary>
        <p className="small"><b>مسیر:</b> {s.isacoPath}</p>
        <ol className="small">{s.guide.map((step, i) => <li key={i}>{step}</li>)}</ol>
      </details>
    </article>
  );
}

function Coverage({ coverage: c }: { coverage: KasbFieldCoverage }) {
  const rows: [string, number, number][] = [
    ['پذیرش با شاسی/VIN کامل', c.receptionsWithVin, c.receptions],
    ['پذیرش با نام خودرو', c.receptionsWithVehicleName, c.receptions],
    ['پذیرش که ریز کارتش خوانده شده', c.receptionsWithLines, c.receptions],
    ['پذیرش با «سالن تعمیرات»', c.receptionsWithHall, c.receptions],
    ['اجرت با نام (نه فقط کد)', c.labourWithName, c.labourLines],
    ['اجرت با تعمیرکار', c.labourWithTechnician, c.labourLines],
    ['اجرت با جایگاه', c.labourWithStation, c.labourLines],
    ['قطعه با نام', c.partsWithName, c.partLines],
    ['قطعه با کد فنی', c.partsWithCode, c.partLines],
    ['قطعه با مبلغ (ریال)', c.partsWithPrice, c.partLines],
  ];
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
  return (
    <section className="panel" aria-labelledby="src-coverage">
      <div className="panel-head"><div><h2 id="src-coverage">کامل بودن دادهٔ کارت تعمیرات</h2><p className="small muted">پذیرش‌های ۳۰ روز اخیر. هر جا کمتر از ۱۰۰٪ است، آمار بر پایهٔ همان مقدار موجود است و حدس زده نمی‌شود.</p></div></div>
      <div className="panel-body table-scroll">
        <table className="table static" data-testid="sources-coverage">
          <thead><tr><th scope="col">داده</th><th scope="col">موجود</th><th scope="col">از</th><th scope="col">درصد</th></tr></thead>
          <tbody>{rows.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{faNum(a)}</td><td>{faNum(b)}</td><td><span className={`m-tag ${b && a === b ? 'ok' : a ? 'wait' : 'stop'}`}>{faNum(pct(a, b))}٪</span></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function FieldMap({ view, onSaved }: { view: DataSourcesView; onSaved: (v: DataSourcesView) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<KasbFieldMap>({});
  const [busy, setBusy] = useState(false);
  const value = (k: KasbFieldKey) => (k in draft ? draft[k] : view.fieldMap[k]) ?? '';
  const changed = KASB_FIELD_KEYS.some((k) => k in draft && (draft[k] ?? null) !== (view.fieldMap[k] ?? null));
  async function save() {
    setBusy(true);
    try {
      const body = Object.fromEntries(KASB_FIELD_KEYS.map((k) => [k, (value(k) || null) as string | null]));
      const saved = await api<DataSourcesView>('/pulse/field-map', { method: 'PUT', body });
      setDraft({});
      onSaved(saved);
      toast('ستون‌ها ثبت شد و همهٔ کارت‌های ذخیره‌شده از روی ردیف رسمی خودشان به‌روز شدند.');
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  }
  return (
    <section className="panel" aria-labelledby="src-fields">
      <div className="panel-head"><div><h2 id="src-fields">ستون‌های کسب‌وکار که هنوز تأیید نشده‌اند</h2>
        <p className="small muted">نام این ستون‌ها در هیچ نمونهٔ ضبط‌شده‌ای از کسب‌وکار نبوده است؛ منیج آن‌ها را حدس نمی‌زند. فقط از میان ستون‌هایی که پالس در پاسخ واقعی دیده انتخاب می‌شوند و پس از ثبت، همهٔ کارت‌های قبلی هم از ردیف رسمی ذخیره‌شده پر می‌شوند.</p></div></div>
      <div className="panel-body stack">
        {KASB_FIELD_KEYS.map((k) => {
          const def = KASB_FIELD_DEFS[k];
          const options = view.observedColumns[def.list];
          return (
            <label key={k} className="field">
              <span>{def.label} <span className="xs muted">· {KASB_FIELD_LIST_LABELS[def.list]}</span></span>
              <select className="input" value={value(k)} disabled={busy || !options.length} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value || null }))}>
                <option value="">{options.length ? 'تأیید نشده' : 'پالس هنوز پاسخی از این فهرست ندیده است'}</option>
                {options.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="xs muted">{def.hint}</span>
            </label>
          );
        })}
        <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={busy || !changed} onClick={() => void save()}>ثبت ستون‌ها</button></div>
      </div>
    </section>
  );
}

function ManualReception({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const { data: latest, mutate } = useSWR<{ import: ReceptionImportPreview | null }>('/pulse/reception-import/latest', fetcher);
  const [preview, setPreview] = useState<ReceptionImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = preview ?? latest?.import ?? null;
  async function choose(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (f.size > 5_000_000) return toast('فایل باید کمتر از پنج مگابایت باشد.', 'error');
    setBusy(true);
    try { setPreview(await api<ReceptionImportPreview>('/pulse/reception-import/preview', { body: { fileName: f.name, fileBase64: await b64(f) } })); }
    catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  }
  async function apply(id: string) {
    setBusy(true);
    try {
      setPreview(await api<ReceptionImportPreview>(`/pulse/reception-import/${id}/apply`, { body: {} }));
      toast('پذیرش‌ها و ریز کارت ثبت شد.');
      void mutate();
      onDone();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  }
  const OUTCOME = { new: 'تازه', update: 'به‌روزرسانی', unchanged: 'بدون تغییر', error: 'ثبت نمی‌شود' } as const;
  return (
    <section className="panel" id="manual-reception" aria-labelledby="src-manual">
      <div className="panel-head"><div><h2 id="src-manual">بارگذاری دستی پذیرش و ریز کارت</h2>
        <p className="small muted">وقتی پالس قطع است. کلید هر ردیف شمارهٔ پذیرش است: کارت موجود به‌روز می‌شود، کارت تازه اضافه می‌شود و فایل تکراری چیزی را دو بار ثبت نمی‌کند. وقتی پالس برگشت، همان کارت را از کسب‌وکار می‌خواند و جای دادهٔ دستی را می‌گیرد.</p></div>
        <div className="row no-print"><a className="btn btn-sm" href="/api/v1/pulse/reception-import/template"><AppIcon name="download" />قالب Excel</a></div></div>
      <div className="panel-body stack">
        <label className="field"><span>فایل «پذیرش و ریز کارت» (xlsx)</span><input className="input" type="file" accept=".xlsx,.xls,.xml,.html" disabled={busy} onChange={(e) => { void choose(e.target.files); e.target.value = ''; }} /></label>
        {shown && <div className="stack" data-testid="manual-reception-preview">
          <p className="small"><bdi>{shown.fileName}</bdi> · {shown.status === 'applied' ? `ثبت شد ${shown.appliedAt ? formatJalali(shown.appliedAt, { time: true }) : ''}` : 'پیش‌نمایش'} · {faNum(shown.counts.new)} کارت تازه · {faNum(shown.counts.update)} به‌روزرسانی · {faNum(shown.counts.unchanged)} بدون تغییر · {faNum(shown.counts.error)} ثبت‌نشدنی · {faNum(shown.counts.labour)} اجرت · {faNum(shown.counts.parts)} قطعه</p>
          {shown.columns.some((c) => !c.field) && <p className="callout callout-amber small">این ستون‌ها شناخته نشدند و خوانده نمی‌شوند: {shown.columns.filter((c) => !c.field).map((c) => c.header).join('، ')}</p>}
          {shown.rowErrors.length > 0 && <ul className="small">{shown.rowErrors.slice(0, 20).map((r, i) => <li key={i}>ردیف {faNum(r.rowNo)}: {r.message}</li>)}</ul>}
          <div className="table-scroll"><table className="table static"><thead><tr><th scope="col">شماره پذیرش</th><th scope="col">نتیجه</th><th scope="col">اجرت</th><th scope="col">قطعه</th></tr></thead>
            <tbody>{shown.cards.slice(0, 200).map((c) => <tr key={c.admissionNo}><td><bdi>{c.admissionNo}</bdi></td><td>{OUTCOME[c.outcome]}{c.message ? ` — ${c.message}` : ''}</td><td>{faNum(c.labour)}</td><td>{faNum(c.parts)}</td></tr>)}</tbody></table></div>
          {shown.status === 'preview' && <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={busy || !(shown.counts.new + shown.counts.update)} onClick={() => void apply(shown.id)}>ثبت {faNum(shown.counts.new + shown.counts.update)} کارت</button></div>}
        </div>}
      </div>
    </section>
  );
}

/**
 * «گزارش توقف خودرو → گزارش جزئی اکسل» (H4 part 7): only the column names of the file, how many rows it
 * has and how many rows fill each column. Nothing is stored or mapped; what each column means is decided
 * later from this list, never guessed.
 */
function StoppageColumns() {
  const toast = useToast();
  const [preview, setPreview] = useState<StoppageColumnsPreview | null>(null);
  const [busy, setBusy] = useState(false);
  async function choose(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (f.size > 5_000_000) return toast('فایل باید کمتر از پنج مگابایت باشد.', 'error');
    setBusy(true);
    try { setPreview(await api<StoppageColumnsPreview>('/pulse/sources/stoppages/columns', { body: { fileName: f.name, fileBase64: await b64(f) } })); }
    catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  }
  return (
    <section className="panel" id="stoppage-columns" aria-labelledby="src-stop-cols" data-testid="stoppage-columns">
      <div className="panel-head"><div><h2 id="src-stop-cols">پیش‌نمایش ستون‌های گزارش توقف خودرو</h2>
        <p className="small muted">کسب‌وکار: بازرگانی ← گزارش ← گزارشات انبار ← گزارش توقف خودرو، خروجی «گزارش جزئی اکسل». فقط نام ستون‌ها و تعداد ردیف‌ها دیده می‌شود؛ چیزی ثبت نمی‌شود و ستونی حدس زده نمی‌شود.</p></div></div>
      <div className="panel-body stack">
        <label className="field"><span>فایل «گزارش جزئی اکسل»</span><input className="input" type="file" accept=".xlsx,.xls,.xml,.html" disabled={busy} onChange={(e) => { void choose(e.target.files); e.target.value = ''; }} /></label>
        {preview && (preview.blocked ? <p className="callout callout-red small" role="alert">{preview.blocked}</p> : (
          <div className="stack">
            <p className="small"><bdi>{preview.fileName}</bdi> · {preview.format} · برگهٔ {preview.sheetName ?? '—'} · ردیف نام ستون‌ها {faNum(preview.headerRow ?? 0)} · {faNum(preview.rows)} ردیف · {faNum(preview.columns.length)} ستون</p>
            <p className={`callout small ${preview.importer.readable ? 'callout-blue' : 'callout-amber'}`}>{preview.importer.readable ? 'ورود فعلی «خودروهای متوقف» این قالب را می‌خواند.' : `ورود فعلی «خودروهای متوقف» این قالب را نمی‌خواند${preview.importer.problem ? `: ${preview.importer.problem}` : ''}.`}</p>
            <div className="table-scroll"><table className="table static"><thead><tr><th scope="col">#</th><th scope="col">نام ستون</th><th scope="col">ردیف‌های پر</th></tr></thead>
              <tbody>{preview.columns.map((c, i) => <tr key={i}><td>{faNum(i + 1)}</td><td>{c.header}</td><td>{faNum(c.filled)} از {faNum(preview.rows)}</td></tr>)}</tbody></table></div>
          </div>
        ))}
      </div>
    </section>
  );
}
