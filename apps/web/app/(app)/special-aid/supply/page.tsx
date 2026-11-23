'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { EMDAD_STATUS_CATEGORIES, EMDAD_STATUS_CATEGORY_LABELS, toPersianDigits, type Paged, type SpecialAidSupplyRow, type SupplySearchInput } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { JalaliInput } from '@/components/JalaliInput';
import { SpecialAidTabs, dayText } from '@/components/SpecialAid';

/**
 * «پیگیری تأمین قطعات»: parts still in supply, with the official status text and its official
 * date kept apart from the day Manage first saw the status. No purchase order is created here.
 */
export default function SpecialAidSupply() {
  const { can } = useAuth();
  const toast = useToast();
  const [term, setTerm] = useState(''), [q, setQ] = useState(''), [status, setStatus] = useState(''), [idle, setIdle] = useState('');
  const [from, setFrom] = useState<string | null>(null), [to, setTo] = useState<string | null>(null), [page, setPage] = useState(1);
  const filter: Partial<SupplySearchInput> = { ...(q ? { q } : {}), ...(status ? { status } : {}), ...(idle ? { minIdleDays: Number(idle) } : {}), ...(from ? { requestedFrom: from } : {}), ...(to ? { requestedTo: to } : {}) };
  const body = { ...filter, page, pageSize: 50 };
  const { data, error, isLoading } = useSWR<Paged<SpecialAidSupplyRow>>(can('special_aid.supply') ? ['/special-aid/supply/search', JSON.stringify(body)] : null, ([p, b]: [string, string]) => api<Paged<SpecialAidSupplyRow>>(p, { body: JSON.parse(b) }));
  if (!can('special_aid.supply')) return <div className="stack"><SpecialAidTabs /><div className="callout"><h1>پیگیری تأمین قطعات</h1><p>برای این بخش مجوز ندارید.</p></div></div>;
  const search = (e: FormEvent) => { e.preventDefault(); setQ(term.trim()); setPage(1); };
  async function exportFile() {
    try {
      const res = await fetch('/api/v1/special-aid/supply/export', { method: 'POST', headers: { 'content-type': 'application/json', 'x-manage-client': 'web' }, body: JSON.stringify(filter) });
      if (!res.ok) throw new Error('خروجی ساخته نشد');
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = 'special-aid-supply.xlsx'; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast(errorMessage(e), 'error'); }
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));
  return (
    <div className="stack">
      <header className="unit-header"><div><h1>پیگیری تأمین قطعات امداد ویژه</h1><p className="muted">قطعه‌هایی که هنوز نرسیده‌اند. «روز بدون تغییر» از نخستین مشاهدهٔ همین وضعیت در منیج حساب می‌شود و تاریخ رسمی شرکت نیست.</p></div></header>
      <SpecialAidTabs />
      <section className="panel"><div className="panel-head"><div><h2>درخواست‌های در جریان</h2><p className="muted small" role="status">{data ? `${faNum(data.total)} قطعه` : ' '}</p></div><div className="row no-print"><button type="button" className="btn btn-sm" onClick={() => void exportFile()}>خروجی Excel برای شرکت</button></div></div>
        <div className="panel-body stack">
          <form className="workspace-search no-print" onSubmit={search}>
            <label className="field">کد، شاسی یا شمارهٔ امداد ویژه<input className="input" value={term} maxLength={80} autoComplete="off" onChange={(e) => setTerm(e.target.value)} /></label>
            <button type="submit" className="btn btn-primary">جست‌وجو</button>
            <label className="field">وضعیت رسمی<select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">همه</option>{EMDAD_STATUS_CATEGORIES.filter((c) => !['in_dealer_stock', 'received_by_dealer', 'cancelled', 'supplied_by_dealer'].includes(c)).map((c) => <option key={c} value={c}>{EMDAD_STATUS_CATEGORY_LABELS[c]}</option>)}</select></label>
            <label className="field">حداقل روز بدون تغییر<input className="input" inputMode="numeric" value={idle} onChange={(e) => { setIdle(e.target.value.replace(/\D/g, '').slice(0, 4)); setPage(1); }} /></label>
            <JalaliInput label="ثبت امداد از" value={from} onChange={(v) => { setFrom(v); setPage(1); }} />
            <JalaliInput label="ثبت امداد تا" value={to} onChange={(v) => { setTo(v); setPage(1); }} />
          </form>
          {error && <p className="callout callout-red small" role="alert">{errorMessage(error)}</p>}
          {isLoading && !data && <p className="muted small" role="status">در حال دریافت…</p>}
          {data && !data.total && <p className="muted small">قطعه‌ای با این صافی نیست.</p>}
          {!!data?.total && <div className="table-scroll"><table className="table static" data-testid="aid-supply"><thead><tr><th>شمارهٔ امداد ویژه</th><th>شاسی</th><th>کد</th><th>شرح</th><th>وضعیت رسمی (متن گزارش)</th><th>ثبت امداد (رسمی)</th><th>نخستین مشاهدهٔ وضعیت</th><th>روز بدون تغییر</th></tr></thead>
            <tbody>{data.items.map((r) => <tr key={r.itemId}>
              <td><Link href={`/special-aid/vehicles/${r.dossierId}`}><bdi>{toPersianDigits(r.emdadNo ?? '—')}</bdi></Link></td>
              <td className="small"><bdi dir="ltr" className="vin-text">{r.vin}</bdi></td>
              <td className="small"><bdi>{toPersianDigits(r.procurementCode ?? r.assessmentCode ?? '—')}</bdi></td>
              <td className="small">{r.description ?? '—'}</td>
              <td className="small">{r.officialStatus || '—'}</td>
              <td className="small">{dayText(r.registeredAt)}</td>
              <td className="small">{dayText(r.statusObservedAt)}</td>
              <td><span className={`m-tag ${(r.idleDays ?? 0) >= 30 ? 'stop' : (r.idleDays ?? 0) >= 14 ? 'wait' : 'mute'}`}>{r.idleDays == null ? '—' : faNum(r.idleDays)}</span></td>
            </tr>)}</tbody></table></div>}
          {pages > 1 && <div className="row no-print"><button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>صفحه قبل</button><span className="small">صفحه {faNum(page)} از {faNum(pages)}</span><button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>صفحه بعد</button></div>}
        </div></section>
    </div>
  );
}
