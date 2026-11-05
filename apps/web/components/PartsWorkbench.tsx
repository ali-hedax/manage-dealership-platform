'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { COVERAGE_LABELS, type PartsWorkbench as Workbench, type PartsWorkbenchLine } from '@manage/shared';
import { useAuth } from '@/lib/auth';
import { api, errorMessage, fetcher } from '@/lib/api';
import { faNum, parseRials } from '@/lib/format';
import { Plate } from './Plate';
import { JalaliInput } from './JalaliInput';
import { PartsOperationNotices, ExternalWorkPanel } from './PartsOperations';

const actions = { reserve: 'آماده تحویل', market: 'خریدم', emdad: 'ثبت امداد ویژه', received: 'آماده تحویل', handover: 'تحویل دادم', follow_up: 'پیگیری' };

export function PartsWorkbench() {
  const { can } = useAuth();
  const [transit, setTransit] = useState(false);
  const { data, error, mutate } = useSWR<Workbench>(`/parts/workbench?transit=${transit ? '1' : '0'}`, fetcher, { refreshInterval: 30_000 });
  const { data: jobs } = useSWR<import('@manage/shared').ExternalWork[]>('/parts/external-work', fetcher, { refreshInterval: 30_000 });
  const externalCount = jobs?.filter(j => j.status !== 'approved' && j.status !== 'done').length ?? 0;
  const total = data ? data.cards.reduce((n, card) => n + card.items.length, 0) + externalCount : 0;
  return <div className="stack parts-workbench">
    <header className="parts-workbench-header">
      <div><h1>{data ? `امروز ${faNum(total)} کار با شماست.` : 'کارهای من'}</h1><p className="muted">کارهای قطعات به ترتیب فوریت</p></div>
      {can('daily_reports.upload') && <Link className="btn btn-primary" href="/daily-reports?kind=emdad">بارگذاری گزارش امداد ویژهٔ امروز</Link>}
    </header>
    <PartsOperationNotices parts />
    {error && <p role="alert" className="callout callout-red">{errorMessage(error)} <button className="btn" onClick={() => void mutate()}>تلاش دوباره</button></p>}
    {!data && !error && <p role="status">در حال دریافت کارها…</p>}
    {data && <>
      <div className="parts-workbench-stats">
        <Summary label="منتظر تصمیم شما" value={data.counts.decision} />
        <Summary label="رسیده، هنوز تحویل نشده" value={data.counts.ready} />
        <Summary label="امداد ویژهٔ دیرکرده" value={data.counts.overdueEmdad} />
      </div>
      <h2>کارهای من</h2>
      {data.cards.length === 0 && <p className="callout">کار قطعه‌ای در این صف نیست.</p>}
      {data.cards.map(card => <article key={card.id} className="panel parts-workbench-card">
        <div className="panel-head">
          <div className="row"><Plate value={card.plate ?? ''}/><Link href={`/cases/${card.id}#case-parts`}><strong>{card.model || card.caseNumber}{card.color && ` · ${card.color}`}</strong></Link><span className="chip">{COVERAGE_LABELS[card.coverage]}</span></div>
          {card.waiting && <span className="chip chip-red">{card.waiting} منتظر قطعه است</span>}
        </div>
        <div className="panel-body stack">
          {card.items.map(line => <PartLine key={`${line.id}:${line.version}:${line.action}`} item={line} card={card} refresh={() => void mutate()}/>)}
        </div>
      </article>)}
      {data.inTransit > 0 && <div className="callout row">
        <span>{faNum(data.inTransit)} قطعهٔ دیگر در امداد ویژه در راه‌اند و دیر نکرده‌اند.</span>
        <button className="btn btn-ghost" onClick={() => setTransit(!transit)}>{transit ? 'پنهان کردن اقلام در راه' : 'نمایش همه'}</button>
      </div>}
    </>}
    <ExternalWorkPanel queue />
  </div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="panel panel-body"><span className="muted small">{label}</span><strong>{faNum(value)}</strong></div>;
}

function PartLine({ item, card, refresh }: { item: PartsWorkbenchLine; card: Workbench['cards'][number]; refresh: () => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [eta, setEta] = useState<string | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(new Date().toISOString());
  const action = item.action;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const salePriceRial = parseRials(data.get('salePrice'));
    const expectedVersion = item.version;
    const endpoint = `/parts/workbench/${action === 'emdad' ? card.id : item.id}/actions`;
    setError('');setBusy(true);
    try {
      if (action === 'handover') {
        await api(`/parts/${item.id}/actions`, { body: { action: 'hand_over', expectedVersion, salePriceRial, recipientName: data.get('recipient') } });
      } else if (action === 'reserve' && item.stock) {
        const { snapshotId, fullStockCode, locationAddress } = item.stock;
        await api(endpoint, { body: { action, expectedVersion, salePriceRial, stock: { snapshotId, fullStockCode, locationAddress, confirm: true } } });
      } else if (action === 'received') {
        await api(endpoint, { body: { action, expectedVersion, emdadId: item.emdadId, salePriceRial } });
      } else if (action === 'market') {
        await api(endpoint, { body: { action, expectedVersion, salePriceRial, purchasePriceRial: parseRials(data.get('purchasePrice')), supplier: data.get('supplier'), orderRef: data.get('reference') || undefined } });
      } else if (action === 'emdad') {
        const selected = new Set(data.getAll('included'));
        await api(endpoint, { body: { action, requestNo: data.get('reference'), requestedAt, etaAt: eta ?? undefined,
          parts: card.items.filter(p => selected.has(p.id)).map(p => ({ id: p.id, expectedVersion: p.version,
            companyPriceRial: parseRials(data.get(`purchase-${p.id}`)), salePriceRial: parseRials(data.get(`sale-${p.id}`)) })) } });
      }
      setOpen(false);refresh();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const priceRequired = action === 'reserve' || action === 'received' || action === 'handover';
  return <div className="parts-workbench-line">
    <div className="parts-workbench-line-main">
      <div>
        <strong>{item.description}</strong>
        <p className="muted small">{faNum(item.quantity)} عدد{item.partNumber && <> · کد فنی <bdi>{item.partNumber}</bdi></>}</p>
        {item.stock && <span className="chip chip-green">موجودی آزاد {faNum(Number(item.stock.available))}</span>}
        {item.overdueHandover && <span className="chip chip-red">بیش از ۴ ساعت کاری در انتظار تحویل</span>}
        {item.overdue && <span className="chip chip-red">موعد گذشته</span>}
        {item.emdadAverageDays !== null && action === 'emdad' && <span className="chip chip-amber">معمولاً {faNum(item.emdadAverageDays)} روزه می‌رسد</span>}
      </div>
      {action === 'follow_up'
        ? <Link className="btn" href={item.emdadRef ? `/emdad?q=${encodeURIComponent(item.emdadRef)}` : `/cases/${card.id}#case-parts`}>پیگیری</Link>
        : <button className="btn btn-primary" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{actions[action]}</button>}
    </div>
    {open && <form className="stack" onSubmit={submit}>
      {action === 'emdad' && <>
        <fieldset className="stack"><legend>اقلام همین درخواست</legend>
          {card.items.filter(p => p.action === 'emdad').map(p => <div key={p.id} className="stack">
            <label><input type="checkbox" name="included" value={p.id} defaultChecked={p.id === item.id} required={p.id === item.id}/> {p.description}</label>
            <label className="field">قیمت واحد شرکت (ریال)<input className="input" name={`purchase-${p.id}`} inputMode="numeric" required={p.id === item.id}/></label>
            <label className="field">قیمت فروش (ریال)، در صورت تفاوت<input className="input" name={`sale-${p.id}`} inputMode="numeric"/></label>
          </div>)}
        </fieldset>
        <label className="field">شماره درخواست<input className="input" name="reference" maxLength={64} required /></label>
        <JalaliInput label="تاریخ درخواست" value={requestedAt} onChange={setRequestedAt} withTime required />
        <JalaliInput label="موعد پیش‌بینی رسیدن" value={eta} onChange={setEta} withTime />
      </>}
      {action === 'market' && <label className="field">قیمت واحد خرید (ریال)<input className="input" name="purchasePrice" inputMode="numeric" required /></label>}
      {action === 'market' && <>
        <label className="field">فروشنده<input className="input" name="supplier" maxLength={120} required /></label>
        <label className="field">شماره فاکتور خرید<input className="input" name="reference" maxLength={64} /></label>
      </>}
      {action === 'handover' && <label className="field">تحویل‌گیرنده<input className="input" name="recipient" maxLength={120} required /></label>}
      {action !== 'emdad' && <label className="field">قیمت واحد فروش (ریال)<input className="input" name="salePrice" inputMode="numeric" required={priceRequired} defaultValue={item.suggestedPriceRial ?? ''} /></label>}
      {error && <p className="callout callout-red" role="alert">{error}</p>}
      <div className="row"><button className="btn btn-primary" disabled={busy || (action === 'emdad' && !requestedAt)}>{busy ? 'در حال ثبت…' : 'ثبت'}</button><button type="button" className="btn" onClick={() => setOpen(false)}>بستن</button></div>
    </form>}
  </div>;
}
