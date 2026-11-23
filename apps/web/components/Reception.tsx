'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { RECEPTION_VIEW_LABELS, formatJalali, pulseAgo, toPersianDigits, type ReceptionList as ReceptionListData, type ReceptionRow, type ReceptionView } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { AppIcon } from './AppIcon';
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

/** «پذیرش‌های امروز»، «پذیرش‌های باز» و «ترخیص‌شده‌ها». Search is POSTed: VINs stay out of URLs. */
export function ReceptionList({ view }: { view: ReceptionView }) {
  const { can, me } = useAuth();
  const [term, setTerm] = useState(''), [q, setQ] = useState(''), [page, setPage] = useState(1);
  const active = me.modules.some((m) => m.key === 'reception' && m.status === 'active');
  const body = { view, page, pageSize: PAGE, ...(q ? { q } : {}) };
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
      {error && <p role="alert" className="m-error">{errorMessage(error)}</p>}
      {isLoading && !data && <p className="muted small" role="status">در حال خواندن پذیرش‌ها…</p>}
      {data && !data.items.length && <p className="m-empty">{q ? 'پذیرشی با این جست‌وجو نیست.' : view === 'today' ? 'امروز هنوز پذیرشی از کسب‌وکار خوانده نشده است.' : 'در این فهرست پذیرشی نیست.'}</p>}
      {!!data?.items.length && <ol className="rcp-list" data-testid="reception-list">{data.items.map((r) => <li key={r.id}><ReceptionRowLink r={r} /></li>)}</ol>}
      {pages > 1 && <div className="row no-print"><button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>صفحه قبل</button><span className="small">صفحه {faNum(page)} از {faNum(pages)}</span><button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>صفحه بعد</button></div>}
    </section>
  );
}
