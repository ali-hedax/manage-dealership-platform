'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { RECEPTION_KIND_LABELS, RECEPTION_STAY_FILTERS, RECEPTION_STAY_LABELS, RECEPTION_VIEW_LABELS, formatJalali, parseLaborCodes, pulseAgo, toPersianDigits, type ReceptionDayStats, type ReceptionList as ReceptionListData, type ReceptionRow, type ReceptionSettings, type ReceptionStay, type ReceptionView } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { AppIcon } from './AppIcon';
import { DataGaps } from './DataGaps';
import { EmptyState } from './EmptyState';
import { Plate } from './Plate';

// «پذیرش و ترخیص» (spec section 26): admissions read from کسب‌وکار by Manage Pulse, one compact
// row each on the paper desk of the approved design. Read only: the official data stays in
// کسب‌وکار; Manage adds outside work and notes in the reception folder.

const VIEWS: { key: ReceptionView; href: string }[] = [
  { key: 'today', href: '/reception' },
  { key: 'open', href: '/reception/open' },
  { key: 'released', href: '/reception/released' },
];
const PAGE = 30;

const timeOf = (iso: string | null) => (iso ? toPersianDigits(formatJalali(iso, { time: true }).split(' ')[1] ?? '') : '—');

/** The three lists of the module as one tab row. */
export function ReceptionTabs({ view }: { view: ReceptionView }) {
  const router = useRouter();
  return (
    <nav className="chips" aria-label="فهرست‌های پذیرش">
      {VIEWS.map((v) => <button key={v.key} type="button" className={v.key === view ? 'on' : ''} aria-current={v.key === view ? 'page' : undefined} onClick={() => router.push(v.href)}>{RECEPTION_VIEW_LABELS[v.key]}</button>)}
    </nav>
  );
}

/** One admission: plate with the admission number under it, vehicle, customer, status, time, days, parts, «تصادفی». */
export function ReceptionRowLink({ r }: { r: ReceptionRow }) {
  return (
    <Link href={`/reception/${r.id}`} className={`rcp-row${r.isOpen ? '' : ' is-closed'}`} data-testid="reception-row">
      <span className="rcp-plate"><Plate value={r.plate} size="row" /><small>پذیرش {r.admissionNo ? <bdi>{toPersianDigits(r.admissionNo)}</bdi> : '—'}</small></span>
      <span className="rcp-who"><strong>{r.vehicleName ?? 'خودرو'}</strong><span>{r.customerName ?? 'مشتری ثبت نشده'}</span></span>
      <span className="rcp-status"><span className={`m-tag ${r.isOpen ? 'mute' : 'ok'}`}>{r.statusText ?? (r.isOpen ? 'باز' : 'ترخیص‌شده')}</span></span>
      <span className="rcp-meta">
        <span title="ساعت پذیرش"><AppIcon name="clock" /> {timeOf(r.admittedAt)}</span>
        <span title="روز در نمایندگی">{r.daysIn == null ? '—' : r.daysIn <= 1 ? 'امروز' : `${faNum(r.daysIn)} روز`}</span>
        <span title="قطعه‌های روی کارت"><AppIcon name="box" /> {faNum(r.partsCount)}</span>
        {r.caseId && <span className="m-tag wait" title={`پروندهٔ تصادفی ${r.caseNumber ?? ''}`}>تصادفی</span>}
      </span>
    </Link>
  );
}

/**
 * Daily statistics of today's receptions (scenario 2026-11-25): repair / periodic service and oil /
 * no labour yet, per receptionist. Read from the labour lines Pulse brought; nothing is typed.
 */
export function ReceptionStats() {
  const { can } = useAuth();
  const { data, error } = useSWR<ReceptionDayStats>(['/reception/stats', '{}'], ([p]: [string, string]) => api<ReceptionDayStats>(p, { body: {} }), { refreshInterval: 120_000 });
  if (error) return <p role="alert" className="m-error">{errorMessage(error)}</p>;
  if (!data) return null;
  return (
    <section className="rcp-stats" aria-label="آمار پذیرش امروز" data-testid="reception-stats">
      {/* S09 (owner, 2026-11-28): from labour names, used parts and «سالن تعمیرات», one car once in each. */}
      <div className="rcp-stat-row" data-testid="reception-jobs">
        <span className="rcp-stat-total"><strong>{faNum(data.total)}</strong> پذیرش امروز</span>
        <span className="m-tag ok">سرویس سریع {faNum(data.jobs.quickService)}</span>
        <span className="m-tag">تعمیراتی {faNum(data.jobs.technicalRepair)}</span>
        <span className="m-tag ok">تعویض روغن {faNum(data.jobs.oilChange)}</span>
        {data.jobs.none > 0 && <span className="m-tag mute" title="هنوز اجرت یا قطعهٔ روغنی روی کارت نیست">{RECEPTION_KIND_LABELS.unclassified} {faNum(data.jobs.none)}</span>}
        {data.declinedLabour > 0 && <span className="m-tag wait" data-testid="declined-labour" title="اجرت‌هایی که مشتری انجامشان را نخواست؛ در شمارش کار نیامده‌اند">عدم تمایل به تعمیر {faNum(data.declinedLabour)}</span>}
      </div>
      <DataGaps stats={data} />
      {data.jobsByReceptionist.length > 0 && (
        <details className="rcp-people">
          <summary>به تفکیک پذیرشگر</summary>
          <div className="table-scroll">
            <table className="table static">
              <thead><tr><th scope="col">پذیرشگر</th><th scope="col">همه</th><th scope="col">سرویس سریع</th><th scope="col">تعمیراتی</th><th scope="col">تعویض روغن</th></tr></thead>
              <tbody>{data.jobsByReceptionist.map((p) => <tr key={p.name}><th scope="row">{p.name}</th><td>{faNum(p.total)}</td><td>{faNum(p.quickService)}</td><td>{faNum(p.technicalRepair)}</td><td>{faNum(p.oilChange)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
      {can('settings.manage') && <ServiceCodesEditor />}
    </section>
  );
}

/**
 * Owner / system administrator: the codes that decide «تعویض روغن» and «سرویس سریع» (H4 part 1) —
 * labour codes of periodic service and oil change, quick-service defect groups, and oil part codes.
 */
const CODE_LISTS = [
  { key: 'serviceLaborCodes', label: 'کدهای اجرت سرویس ادواری و تعویض روغن', placeholder: '10165C0، 10145C0' },
  { key: 'quickServiceGroups', label: 'گروه ایراد سرویس سریع (همهٔ اجرت‌های زیر آن سرویس است)', placeholder: '910100' },
  { key: 'oilPartCodes', label: 'کد قطعه‌های روغن موتور و فیلتر روغن', placeholder: '07707016، 12402027' },
] as const;
type CodeListKey = (typeof CODE_LISTS)[number]['key'];
function ServiceCodesEditor() {
  const { mutate } = useSWRConfig();
  const { data } = useSWR<ReceptionSettings>('/reception/settings', (p: string) => api<ReceptionSettings>(p));
  const [text, setText] = useState<Partial<Record<CodeListKey, string>>>({}), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const value = (k: CodeListKey) => text[k] ?? (data?.[k].join('، ') ?? '');
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const body = Object.fromEntries(CODE_LISTS.map((l) => [l.key, parseLaborCodes(value(l.key))]));
      const saved = await api<ReceptionSettings>('/reception/settings', { method: 'PUT', body });
      await mutate('/reception/settings', saved, { revalidate: false });
      await mutate(['/reception/stats', '{}']);
      setText({});
      setMessage('کدها ذخیره شد.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="rcp-codes">
      <summary>کدهای تعویض روغن و سرویس سریع</summary>
      <form onSubmit={save} className="stack">
        {data && !data.saved && <p className="small muted">کدهای پیش‌فرض مالک به کار می‌روند تا فهرست دیگری ذخیره شود.</p>}
        {CODE_LISTS.map((l) => (
          <label key={l.key} className="field">
            <span>{l.label}؛ با ویرگول یا خط تازه جدا کنید.</span>
            <textarea className="input ltr-input" rows={2} value={value(l.key)} onChange={(e) => setText((t) => ({ ...t, [l.key]: e.target.value }))} placeholder={l.placeholder} />
          </label>
        ))}
        <div className="row"><button type="submit" className="btn btn-sm" disabled={busy || !data}>ذخیرهٔ کدها</button>{message && <span className="small" role="status">{message}</span>}</div>
      </form>
    </details>
  );
}

/** «مانده از دیروز / پریروز / ۳ روز و بیشتر» on the open list. */
function StayChips({ stay, onChange }: { stay: ReceptionStay | null; onChange: (s: ReceptionStay | null) => void }) {
  return (
    <div className="chips" role="group" aria-label="ماندگاری پذیرش‌های باز">
      <button type="button" className={stay === null ? 'on' : ''} aria-pressed={stay === null} onClick={() => onChange(null)}>همه</button>
      {RECEPTION_STAY_FILTERS.map((k) => <button key={k} type="button" className={stay === k ? 'on' : ''} aria-pressed={stay === k} onClick={() => onChange(k)}>{RECEPTION_STAY_LABELS[k]}</button>)}
    </div>
  );
}

/** «پذیرش‌های امروز»، «پذیرش‌های باز» و «ترخیص‌شده‌ها». Search is POSTed: VINs stay out of URLs. */
export function ReceptionList({ view }: { view: ReceptionView }) {
  const { can, me } = useAuth();
  const [term, setTerm] = useState(''), [q, setQ] = useState(''), [page, setPage] = useState(1), [stay, setStay] = useState<ReceptionStay | null>(null);
  const active = me.modules.some((m) => m.key === 'reception' && m.status === 'active');
  const body = { view, page, pageSize: PAGE, ...(q ? { q } : {}), ...(view === 'open' && stay ? { stay } : {}) };
  const { data, error, isLoading } = useSWR<ReceptionListData>(can('reception.read') && active ? ['/reception/search', JSON.stringify(body)] : null, ([p, b]: [string, string]) => api<ReceptionListData>(p, { body: JSON.parse(b) }), { refreshInterval: 60_000 });
  if (!can('reception.read')) return <EmptyState icon="lock" title="پذیرش و ترخیص" heading="h1">برای این بخش مجوز ندارید.</EmptyState>;
  if (!active) return <EmptyState icon="file" title="پذیرش و ترخیص" heading="h1" action={{ href: '/modules/reception', label: 'نقشهٔ راه' }}>این بخش هنوز روی این سرور فعال نشده است.</EmptyState>;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  return (
    <section className="desk rcp-desk" aria-labelledby="reception-title">
      <header className="desk-head">
        <div className="desk-hello"><h1 id="reception-title">{RECEPTION_VIEW_LABELS[view]}</h1><p className="desk-sub">{data ? `${faNum(data.total)} پذیرش` : 'در حال خواندن…'}</p></div>
        <p className="desk-kicker rcp-fresh"><AppIcon name="history" /> آخرین به‌روزرسانی از کسب‌وکار: {data ? pulseAgo(data.lastReadAt) : '…'}</p>
      </header>
      <div className="desk-tools">
        <ReceptionTabs view={view} />
        <form className="srch" role="search" onSubmit={(e) => { e.preventDefault(); setQ(term.trim()); setPage(1); }}>
          <AppIcon name="search" /><label className="sr-only" htmlFor="reception-search">جست‌وجوی پذیرش</label>
          <input id="reception-search" type="search" value={term} maxLength={80} onChange={(e) => setTerm(e.target.value)} placeholder="پلاک، شمارهٔ پذیرش، شاسی، VIN یا نام…" autoComplete="off" />
        </form>
      </div>
      {view === 'open' && <StayChips stay={stay} onChange={(s) => { setStay(s); setPage(1); }} />}
      {view === 'today' && <ReceptionStats />}
      {error && <p role="alert" className="m-error">{errorMessage(error)}</p>}
      {isLoading && !data && <p className="muted small" role="status">در حال خواندن پذیرش‌ها…</p>}
      {data && !data.items.length && <p className="m-empty">{q ? 'پذیرشی با این جست‌وجو نیست.' : view === 'today' ? 'امروز هنوز پذیرشی از کسب‌وکار خوانده نشده است.' : 'در این فهرست پذیرشی نیست.'}</p>}
      {!!data?.items.length && <ol className="rcp-list" data-testid="reception-list">{data.items.map((r) => <li key={r.id}><ReceptionRowLink r={r} /></li>)}</ol>}
      {pages > 1 && <div className="row no-print"><button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>صفحه قبل</button><span className="small">صفحه {faNum(page)} از {faNum(pages)}</span><button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>صفحه بعد</button></div>}
    </section>
  );
}
