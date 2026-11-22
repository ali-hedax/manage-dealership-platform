'use client';
import { useState } from 'react';
import useSWR from 'swr';
import type { DossierSearchInput, Paged, SpecialAidDossierRow } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { AppIcon } from '@/components/AppIcon';
import { DossierFolder, SpecialAidTabs } from '@/components/SpecialAid';

const VIEWS: { key: DossierSearchInput['view']; label: string }[] = [
  { key: 'all', label: 'همه' }, { key: 'action', label: 'نیازمند اقدام' }, { key: 'arrived', label: 'دارای قطعهٔ رسیده' }, { key: 'pending', label: 'در حال تأمین' }, { key: 'review', label: 'نیازمند بررسی رزرو' },
];

/** «پرونده خودروها»: one folder per VIN; search by VIN, plate, customer, special-aid or admission number, or code. */
export default function SpecialAidVehicles() {
  const { can } = useAuth();
  const [view, setView] = useState<DossierSearchInput['view']>('all');
  const [term, setTerm] = useState(''), [q, setQ] = useState(''), [page, setPage] = useState(1);
  const body = { view, page, pageSize: 24, ...(q ? { q } : {}) };
  // POST keeps VINs and admission numbers out of URLs and access logs.
  const { data, error, isLoading } = useSWR<Paged<SpecialAidDossierRow>>(can('special_aid.read') ? ['/special-aid/dossiers/search', JSON.stringify(body)] : null, ([p, b]: [string, string]) => api<Paged<SpecialAidDossierRow>>(p, { body: JSON.parse(b) }));
  if (!can('special_aid.read')) return <div className="callout"><h1>پرونده خودروها</h1><p>برای این بخش مجوز ندارید.</p></div>;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 24));
  return (
    <section className="desk" aria-labelledby="aid-vehicles">
      <header className="desk-head">
        <div className="desk-hello"><h1 id="aid-vehicles">پرونده خودروهای امداد ویژه</h1><p className="desk-sub">{data ? `${faNum(data.total)} خودرو` : 'در حال خواندن…'}</p></div>
        <p className="desk-kicker">همهٔ خودروهای نمایندگی · تصادفی و تعمیرات عمومی</p>
      </header>
      <SpecialAidTabs />
      <div className="desk-tools">
        <div className="chips" role="group" aria-label="صافی پرونده‌ها">
          {VIEWS.map((v) => <button key={v.key} type="button" className={view === v.key ? 'on' : ''} aria-pressed={view === v.key} onClick={() => { setView(v.key); setPage(1); }}>{v.label}</button>)}
        </div>
        <form className="srch" role="search" onSubmit={(e) => { e.preventDefault(); setQ(term.trim()); setPage(1); }}>
          <AppIcon name="search" /><span className="sr-only">جست‌وجو</span>
          <input type="search" value={term} maxLength={80} onChange={(e) => setTerm(e.target.value)} placeholder="شاسی، پلاک، مشتری، شمارهٔ امداد یا پذیرش، کد…" />
        </form>
      </div>
      {error && <p role="alert" className="m-error">{errorMessage(error)}</p>}
      {isLoading && !data && <div className="folder-grid" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="folder folder-skeleton" />)}</div>}
      {data && !data.items.length && <p className="m-empty">{q ? 'خودرویی با این جست‌وجو نیست.' : 'در این صافی خودرویی نیست.'}</p>}
      <div className="folder-grid" data-testid="aid-folders">{data?.items.map((d) => <DossierFolder key={d.id} d={d} />)}</div>
      {pages > 1 && <div className="row no-print"><button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>صفحه قبل</button><span className="small">صفحه {faNum(page)} از {faNum(pages)}</span><button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>صفحه بعد</button></div>}
    </section>
  );
}
