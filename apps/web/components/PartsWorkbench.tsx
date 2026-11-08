'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { COVERAGE_LABELS, toLatinDigits, toPersianDigits, type PartsWorkbench as Workbench, type PartsWorkbenchLine, type ManageSupplyRoute } from '@manage/shared';
import { useAuth } from '@/lib/auth';
import { api, errorMessage, fetcher } from '@/lib/api';
import { faNum, parseRials } from '@/lib/format';
import { Plate } from './Plate';
import { JalaliInput } from './JalaliInput';
import { PartsOperationNotices, ExternalWorkPanel } from './PartsOperations';
import { QuotePanel } from './WorkshopQuotes';
import { AppIcon } from './AppIcon';

const SUPPLY_LABELS: Record<ManageSupplyRoute, string> = { reserve: 'استفاده از موجودی', market: 'استعلام خرید بازار', emdad: 'بررسی امداد ویژه' };

export function PartsWorkbench() {
  const { can } = useAuth();
  const [transit, setTransit] = useState(false);
  const [query, setQuery] = useState('');
  const { data, error, mutate } = useSWR<Workbench>(`/parts/workbench?transit=${transit ? '1' : '0'}`, fetcher, { refreshInterval: 30_000 });
  const { data: jobs } = useSWR<import('@manage/shared').ExternalWork[]>('/parts/external-work', fetcher, { refreshInterval: 30_000 });
  const externalCount = jobs?.filter(j => j.status !== 'approved' && j.status !== 'done').length ?? 0;
  const total = data ? data.cards.reduce((n, card) => n + card.items.length, 0) + externalCount : 0;
  const normalize = (value: string | null | undefined) => toLatinDigits(value ?? '').toLowerCase().replace(/[\s\u200c\-_/]/g, '');
  const needle = normalize(query);
  const shown = data?.cards.filter(card => !needle || [card.plate, card.model, card.color, card.caseNumber,
    card.admissionNo, card.vin, card.chassisRef, ...card.emdadRefs].some(value => normalize(value).includes(needle))) ?? [];
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
      <div className="stack"><h2>کارهای من</h2>
        <label className="field">جست‌وجوی خودرو در کارهای من
          <input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="پلاک، شماره پذیرش، شاسی، مدل، پرونده یا امداد ویژه" aria-label="جست‌وجوی کارهای قطعات" />
        </label>
        {needle && <p className="muted small" role="status">{faNum(shown.length)} خودرو از {faNum(data.cards.length)} خودرو پیدا شد.</p>}
      </div>
      {data.cards.length === 0 && <p className="callout">کار قطعه‌ای در این صف نیست.</p>}
      <details className="compact-disclosure panel"><summary>قیمت‌های پیشنهادی و تأییدهای قطعات</summary><QuotePanel /></details>
      {needle && shown.length === 0 && <p className="callout">خودرویی مطابق جست‌وجو در کارهای فعلی پیدا نشد.</p>}
      {shown.map(card => <article key={card.id} className="panel parts-workbench-card">
        <div className="panel-head">
          <div className="row"><Plate value={card.plate ?? ''}/><Link href={`/cases/${card.id}#case-parts`}><strong>{card.model || card.caseNumber}{card.color && ` · ${card.color}`}</strong></Link><span className="chip">{COVERAGE_LABELS[card.coverage]}</span></div>
          <div className="row" style={{gap: 6, flexWrap: 'wrap'}}>
            {card.waiting && <span className="chip chip-red">{card.waiting} منتظر قطعه است</span>}
            {card.items.some(i => i.action === 'emdad') && <span className="chip chip-amber">{faNum(card.items.filter(i => i.action === 'emdad').length)} قلم منتظر تصمیم</span>}
            {card.items.some(i => ['handover','received'].includes(i.action)) && <span className="chip chip-green">{faNum(card.items.filter(i => ['handover','received'].includes(i.action)).length)} قلم آمادهٔ اقدام</span>}
          </div>
        </div>
        <div className="row small" style={{ flexWrap: 'wrap', gap: 8, padding: '0 16px 8px' }}>
          <span>پذیرش: <bdi>{card.admissionNo ? toPersianDigits(card.admissionNo) : 'ثبت نشده'}</bdi></span>
          <span>پرونده: <bdi>{toPersianDigits(card.caseNumber)}</bdi></span>
          <span>{card.model || 'مدل نامشخص'}</span>
          {card.emdadRefs.length > 0 && <span className="chip chip-amber">امداد ویژه: <bdi>{card.emdadRefs.map(toPersianDigits).join('، ')}</bdi></span>}
        </div>
        <details className="compact-disclosure" style={{ margin: '0 16px 8px' }}>
          <summary>مشخصات بیشتر خودرو</summary>
          <div className="stack small">
            <div>شاسی (VIN): <bdi>{card.vin || card.chassisRef || 'ثبت نشده'}</bdi></div>
            {card.vin && card.chassisRef && card.vin !== card.chassisRef && <div>شناسه شاسی: <bdi>{card.chassisRef}</bdi></div>}
            <div>رنگ: {card.color || 'ثبت نشده'} · پوشش: {COVERAGE_LABELS[card.coverage]}</div>
            <Link href={`/cases/${card.id}`}>نمایش پرونده کامل</Link>
          </div>
        </details>
        <VehicleParts card={card} refresh={() => void mutate()}/>
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

type Preparation = { partId: string; route: ManageSupplyRoute; sequence: number };
function VehicleParts({ card, refresh }: {card: Workbench['cards'][number]; refresh: () => void }) {
  const pending = card.items.filter(item => item.action === 'emdad');
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<Record<string, ManageSupplyRoute>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  function generatePlan() {
    const suggestions: Record<string, ManageSupplyRoute> = {};
    for (const item of pending) suggestions[item.id] = item.manageAdvice.route ?? 'market';
    setPlan(suggestions); setAccepted({}); setPreparation(null);
    setError(''); setMessage(''); setPlanOpen(true);
  }
  function changePlan(id: string, route: ManageSupplyRoute) {
    setPlan(prev => ({...prev, [id]: route}));
    setAccepted(prev => ({...prev, [id]: false}));
    setPreparation(null);
  }
  async function approve(item: PartsWorkbenchLine) {
    const route = plan[item.id] ?? item.manageAdvice.route ?? 'market';
    const single = route === 'reserve' && item.stockOptions.length === 1 && Number.isSafeInteger(item.suggestedPriceRial) &&
      item.suggestedPriceRial !== null && item.suggestedPriceRial >= 0;
    setError(''); setMessage('');
    if (single) {
      const location = item.stockOptions[0]!;
      setBusyId(item.id);
      try {
        await api(`/parts/workbench/${item.id}/actions`, {body: {
          action: 'reserve', expectedVersion: item.version, salePriceRial: item.suggestedPriceRial,
          stock: { snapshotId: location.snapshotId, fullStockCode: location.fullStockCode,
            locationAddress: location.locationAddress, confirm: true },
        }});
        setMessage(`رزرو «${item.description}» ثبت شد. موجودی دوباره روی سرور کنترل شد.`);
        refresh();
      } catch (err) { setError(errorMessage(err)); refresh(); }
      finally { setBusyId(null); }
      return;
    }
    setAccepted(prev => ({...prev, [item.id]: true}));
    setPreparation(prev => ({partId: item.id, route, sequence: (prev?.sequence ?? 0) + 1}));
    setMessage(`مسیر «${item.description}» انتخاب شد؛ فرم آن در پایین آماده است و هنوز هیچ سفارش یا خریدی ثبت نشده.`);
  }
  const reviewedCount = pending.filter(item => accepted[item.id]).length;
  return <div className="stack" style={{margin:'0 12px 12px'}}>
    {pending.length > 0 && <div className="row" style={{justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
      <button type="button" className="btn" onClick={generatePlan}>
        <AppIcon name="sparkles"/> برنامه‌ریزی همهٔ قطعات این خودرو با منیج
      </button>
      {planOpen && <span className="chip">{faNum(reviewedCount)} از {faNum(pending.length)} پیشنهاد در فرم آماده شده</span>}
    </div>}
    <details className="compact-disclosure" open={planOpen ? true : undefined}>
      <summary>قطعات و نیازها · {faNum(card.items.length)} قلم · {faNum(pending.length)} قلم منتظر تصمیم</summary>
      <div className="panel-body stack">
      {pending.length > 0 && <div className="stack">
        {planOpen && <section className="panel panel-body stack" aria-label="برنامه گروهی پیشنهادی منیج">
          <strong>برنامهٔ پیشنهادی منیج ـ تصمیم مستقل برای هر قطعه</strong>
          <p className="small muted">پیشنهادها از موجودی، زمان تعمیر و سوابق همین پرونده تهیه شده‌اند. می‌توانید مسیر هر قلم را تغییر دهید. تأیید یک قلم به معنی تأیید بقیه نیست.</p>
          {pending.map(item => {
            const route = plan[item.id] ?? item.manageAdvice.route ?? 'market';
            const readyToReserve = route === 'reserve' && item.stockOptions.length === 1 &&
              item.suggestedPriceRial !== null && Number.isSafeInteger(item.suggestedPriceRial) && item.suggestedPriceRial >= 0;
            return <div key={item.id} className="stack" style={{padding:'8px 0', borderBottom:'1px solid var(--silver)'}}>
              <div className="row" style={{justifyContent:'space-between', flexWrap:'wrap'}}>
                <strong>{item.description} · {faNum(item.quantity)} عدد</strong>
                {accepted[item.id] && <span className="chip chip-green"><AppIcon name="check"/> پیشنهاد پذیرفته شد؛ ثبت نشده</span>}
              </div>
              <p className="small muted">{item.manageAdvice.headline} · {item.manageAdvice.why[0]}</p>
              <div className="row" style={{gap:8, flexWrap:'wrap'}}>
                <label className="field">روش انتخابی
                  <select className="input" aria-label={`روش تأمین ${item.description}`} value={route}
                    onChange={e => changePlan(item.id, e.target.value as ManageSupplyRoute)}>
                    <option value="reserve" disabled={!item.stockOptions.length}>استفاده از موجودی</option>
                    <option value="market">استعلام خرید بازار</option>
                    <option value="emdad">بررسی امداد ویژه</option>
                  </select>
                </label>
                <button type="button" className="btn btn-primary" disabled={busyId !== null}
                  onClick={() => void approve(item)}>
                  <AppIcon name="check"/> {busyId === item.id ? 'در حال ثبت رزرو…' : readyToReserve ? 'تأیید و رزرو این قطعه' : 'تأیید و آماده‌کردن فرم این قطعه'}
                </button>
              </div>
            </div>;
          })}
          {message && <p role="status" className="callout">{message}</p>}
          {error && <p role="alert" className="callout callout-red">{error}</p>}
          <p className="small muted">فقط رزرو تک‌گزینه‌ای با قیمت مشخص، پس از زدن «تأیید و رزرو»، مستقیم ثبت می‌شود. برای قیمت بازار و امداد ویژه، ابتدا باید اطلاعات واقعی و مجوزهای لازم در فرم هر قطعه تکمیل شوند. اجرای خودکار گروهی وجود ندارد.</p>
        </section>}
      </div>}
      {card.items.map(line => <PartLine key={`${line.id}:${line.version}:${line.action}`} item={line} card={card} refresh={refresh}
        preparation={preparation?.partId === line.id ? preparation : null}
        accepted={!!accepted[line.id] && line.action === 'emdad'} />)}
      </div>
    </details>
  </div>;
}

function PartLine({ item, card, refresh, preparation, accepted }: { item: PartsWorkbenchLine; card: Workbench['cards'][number]; refresh: () => void; preparation: Preparation | null; accepted: boolean }) {
  const [choice, setChoice] = useState<'reserve' | 'market' | 'emdad' | null>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [eta, setEta] = useState<string | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(new Date().toISOString());
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [quoteOnly, setQuoteOnly] = useState(false);
  const [noticeSent, setNoticeSent] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [targetTask, setTargetTask] = useState(item.destinations.length === 1 ? item.destinations[0]!.taskId : '');
  useEffect(() => {
    if (!preparation || item.action !== 'emdad') return;
    setChoice(preparation.route); setOpen(true); setAdvisorOpen(false);
    setQuoteOnly(preparation.route === 'market'); setError('');
  }, [preparation, item.action]);
  const action = item.action === 'emdad' ? choice : item.action;
  const showForm = open && !!action && action !== 'follow_up';

  function choose(next: 'reserve' | 'market' | 'emdad', fromManage = false) {
    setChoice(next); setOpen(true); setQuoteOnly(fromManage && next === 'market'); setError('');
  }

  async function notify() {
    if (!targetTask) { setError('لطفاً جایگاه مقصد قطعه را انتخاب کنید.'); return; }
    setError(''); setBusy(true);
    try {
      await api(`/reminders/parts-ready/${item.id}`, { body: { taskId: targetTask } });
      setNoticeSent(true);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || action === 'follow_up') return;
    const data = new FormData(event.currentTarget);
    const salePriceRial = data.get('salePrice') ? parseRials(data.get('salePrice')) : undefined;
    const expectedVersion = item.version;
    const endpoint = `/parts/workbench/${action === 'emdad' ? card.id : item.id}/actions`;
    setError(''); setBusy(true);
    try {
      if (action === 'handover') {
        const destination = item.destinations.find(d => d.taskId === targetTask);
        if (!destination) throw new Error('پیش از تحویل، جایگاه مقصد قطعه را انتخاب کنید.');
        await api(`/parts/${item.id}/actions`, { body: { action: 'hand_over', expectedVersion, salePriceRial, recipientName: data.get('recipient'), departmentId: destination.departmentId } });
      } else if (action === 'reserve') {
        const selected = item.stockOptions.find(o => `${o.snapshotId}|${o.fullStockCode}|${o.locationAddress}` === data.get('stock'));
        if (!selected) throw new Error('موجودی و محل صحیح را انتخاب کنید.');
        const { snapshotId, fullStockCode, locationAddress } = selected;
        await api(endpoint, { body: { action, expectedVersion, salePriceRial, stock: { snapshotId, fullStockCode, locationAddress, confirm: true } } });
      } else if (action === 'received') {
        await api(endpoint, { body: { action, expectedVersion, emdadId: item.emdadId, salePriceRial } });
      } else if (action === 'market') {
        if (quoteOnly) {
          if (!validUntil) throw new Error('تاریخ اعتبار قیمت را ثبت کنید.');
          await api(`/workshop/parts/${item.id}/quotes`, { body: {
            expectedVersion, unitPriceRial: parseRials(data.get('purchasePrice')),
            supplier: data.get('supplier'), validUntil, note: data.get('note') || undefined,
          } });
        } else {
          await api(endpoint, { body: { action, expectedVersion, salePriceRial,
            purchasePriceRial: parseRials(data.get('purchasePrice')), supplier: data.get('supplier'),
            orderRef: data.get('reference') || undefined } });
        }
      } else if (action === 'emdad') {
        await api(endpoint, { body: { action, requestNo: data.get('reference'), requestedAt, etaAt: eta ?? undefined,
          parts: [{ id: item.id, expectedVersion: item.version,
            companyPriceRial: parseRials(data.get('companyPrice')),
            ...(data.get('marketPrice') ? { salePriceRial: parseRials(data.get('marketPrice')) } : {}) }] } });
      }
      setOpen(false); setChoice(null); refresh();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  const ready = item.action === 'handover';
  const awaiting = item.action === 'follow_up';
  return <div className="parts-workbench-line">
    <div className="parts-workbench-line-main">
      <div>
        <strong>{item.description}</strong>
        {accepted && <span className="chip chip-green"><AppIcon name="check"/> پیشنهاد منیج پذیرفته شد · هنوز ثبت نشده</span>}
        <p className="muted small">{faNum(item.quantity)} عدد{item.partNumber && <> · کد فنی <bdi>{item.partNumber}</bdi></>}</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {item.stockOptions.length > 0 && <span className="chip chip-green">موجودی قابل رزرو {faNum(item.stockOptions.reduce((n, o) => n + Number(o.available), 0))}</span>}
          {item.destinations.map(d => <span className="chip" key={d.taskId}><AppIcon name="desk" /> {d.label}</span>)}
          {!item.destinations.length && <span className="chip chip-amber">جایگاه مرتبط هنوز مشخص نشده</span>}
          {item.overdueHandover && <span className="chip chip-red">بیش از ۴ ساعت کاری منتظر تحویل</span>}
          {item.overdue && <span className="chip chip-red">موعد گذشته</span>}
        </div>
        {item.advice && <details className="compact-disclosure"><summary>راهنمای تأمین</summary><p className="small muted">{item.advice}</p></details>}
      </div>
      {awaiting
        ? <Link className="btn" href={item.emdadRef ? `/emdad?q=${encodeURIComponent(item.emdadRef)}` : `/cases/${card.id}#case-parts`}>پیگیری سفارش</Link>
        : item.action !== 'emdad'
          ? <button className="btn" type="button" aria-expanded={open} onClick={() => { setOpen(!open); setError(''); }}>
            {ready ? 'ثبت تحویل' : item.action === 'received' ? 'ثبت رسیدن قطعه' : 'اقدام'}
          </button> : null}
    </div>
    {item.action === 'emdad' && <div className="stack" style={{ marginTop: 8 }}>
      <button type="button" className="btn" aria-expanded={advisorOpen}
        onClick={() => setAdvisorOpen(v => !v)}><AppIcon name="sparkles" /> دستیار منیج · پیشنهاد تأمین قطعه</button>
      {advisorOpen && <div className="panel panel-body stack" role="region" aria-label="پیشنهاد دستیار منیج">
        <div className="row"><AppIcon name="sparkles" /><strong>{item.manageAdvice.headline}</strong>
          <span className="chip">{item.manageAdvice.confidence === 'high' ? 'اطمینان بیشتر' : item.manageAdvice.confidence === 'medium' ? 'نیازمند بررسی' : 'اطلاعات محدود'}</span>
        </div>
        <div className="small muted">این راهنمای داخلی منیج از موجودی، مهلت تعمیر و سوابق ثبت‌شده محاسبه می‌شود؛ در این مرحله به سرویس هوش مصنوعی متصل نیست.</div>
        <ul>{item.manageAdvice.why.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
        {item.manageAdvice.required.length > 0 && <details className="compact-disclosure">
          <summary>اطلاعات و مجوزهای لازم پیش از ثبت · {faNum(item.manageAdvice.required.length)}</summary>
          <ul>{item.manageAdvice.required.map((need, index) => <li key={index}>{need}</li>)}</ul>
        </details>}
        {item.manageAdvice.route && <button type="button" className="btn btn-primary" disabled={busy}
          onClick={() => choose(item.manageAdvice.route!, true)}>
          <AppIcon name="check" /> استفاده از پیشنهاد منیج و تکمیل فرم
        </button>}
        <p className="small muted">ثبت نهایی فقط با تأیید کاربر و کنترل دوبارهٔ قیمت، موجودی و مجوزها انجام می‌شود.</p>
      </div>}
    </div>}
    {item.action === 'emdad' && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }} role="group" aria-label={`انتخاب روش تأمین ${item.description}`}>
      <button type="button" className={`btn ${action === 'reserve' && open ? 'btn-primary' : ''}`} disabled={!item.stockOptions.length || busy}
        onClick={() => choose('reserve')} aria-pressed={action === 'reserve' && open}><AppIcon name="box" /> استفاده از موجودی</button>
      <button type="button" className={`btn ${action === 'market' && open ? 'btn-primary' : ''}`} disabled={busy}
        onClick={() => choose('market')} aria-pressed={action === 'market' && open}><AppIcon name="shopping-cart" /> خرید بازار</button>
      <button type="button" className={`btn ${action === 'emdad' && open ? 'btn-primary' : ''}`} disabled={busy}
        onClick={() => choose('emdad')} aria-pressed={action === 'emdad' && open}><AppIcon name="truck" /> ثبت امداد ویژه</button>
    </div>}
    {ready && <div className="stack">
      <div className="row">
        <label className="field">جایگاه مقصد
          <select className="input" value={targetTask} onChange={e => { setTargetTask(e.target.value); setNoticeSent(false); }}>
            <option value="">انتخاب جایگاه</option>
            {item.destinations.map(d => <option key={d.taskId} value={d.taskId}>{d.label}</option>)}
          </select>
        </label>
        <button type="button" className="btn" disabled={busy || noticeSent || !targetTask} onClick={() => void notify()}>
          <AppIcon name="upload" /> {noticeSent ? 'اعلان ارسال شد' : 'اعلام آماده تحویل'}
        </button>
      </div>
      <p className="small muted">اعلان برای جایگاه منتخب، مسئول آن، واحد قطعات و تصادفات ثبت می‌شود؛ دریافت واقعی جداگانه ثبت می‌شود.</p>
    </div>}
    {error && !showForm && <p role="alert" className="callout callout-red">{error}</p>}
    {showForm && <form className="stack" onSubmit={submit}>
      {action === 'reserve' && <label className="field">محل برداشت قطعه
        <select className="input" name="stock" required defaultValue={item.stockOptions.length === 1 ? `${item.stockOptions[0]!.snapshotId}|${item.stockOptions[0]!.fullStockCode}|${item.stockOptions[0]!.locationAddress}` : ''}>
          <option value="">انتخاب موجودی</option>
          {item.stockOptions.map(o => <option key={`${o.fullStockCode}:${o.locationAddress}`} value={`${o.snapshotId}|${o.fullStockCode}|${o.locationAddress}`}>
            {o.fullStockCode} · {o.locationAddress} · {faNum(Number(o.available))} عدد
          </option>)}
        </select>
      </label>}
      {action === 'emdad' && <>
        <label className="field">قیمت واحد شرکت (ریال)
          <input className="input" name="companyPrice" inputMode="numeric" defaultValue={item.companyPriceRial ?? ''} required/>
          <span className="hint">{item.companyPriceRial === null ? 'قیمت در موجودی پیدا نشد یا متفاوت است؛ دستی ثبت کنید.' : 'از موجودی خوانده شده؛ قابل اصلاح است.'}</span>
        </label>
        <label className="field">قیمت فروش بازار (ریال)، فقط در صورت تفاوت<input className="input" name="marketPrice" inputMode="numeric" /></label>
        <label className="field">شماره درخواست امداد<input className="input" name="reference" maxLength={64} required/></label>
        <JalaliInput label="تاریخ درخواست" value={requestedAt} onChange={setRequestedAt} withTime required/>
        <JalaliInput label="موعد پیش‌بینی رسیدن" value={eta} onChange={setEta} withTime/>
      </>}
      {action === 'market' && <>
        <div className="row" role="group" aria-label="روش اقدام خرید">
          <button type="button" className={`btn ${quoteOnly ? 'btn-primary' : ''}`} onClick={() => setQuoteOnly(true)}>ثبت قیمت پیشنهادی</button>
          <button type="button" className={`btn ${!quoteOnly ? 'btn-primary' : ''}`} onClick={() => setQuoteOnly(false)}>ثبت خرید انجام‌شده</button>
        </div>
        <label className="field">قیمت واحد خرید (ریال)<input className="input" name="purchasePrice" inputMode="numeric" required/></label>
        <label className="field">فروشنده<input className="input" name="supplier" maxLength={120} required/></label>
        {quoteOnly ? <>
          <JalaliInput label="اعتبار قیمت پیشنهادی" value={validUntil} onChange={setValidUntil} withTime required/>
          <label className="field">توضیحات قیمت<input className="input" name="note" maxLength={1000}/></label>
          <p className="small muted">ثبت قیمت پیشنهادی به‌معنای خرید یا تأیید رسمی نیست. تأیید واقعی از بخش قیمت‌ها قابل ثبت است.</p>
        </> : <label className="field">شماره فاکتور خرید<input className="input" name="reference" maxLength={64}/></label>}
      </>}
      {action === 'handover' && <label className="field">نام تحویل‌گیرنده<input className="input" name="recipient" maxLength={120} required/></label>}
      {action !== 'emdad' && !(action === 'market' && quoteOnly) && <label className="field">قیمت واحد فروش (ریال)
        <input className="input" name="salePrice" inputMode="numeric" required={action === 'reserve' || action === 'received' || action === 'handover'} defaultValue={item.suggestedPriceRial ?? ''}/>
      </label>}
      {error && <p className="callout callout-red" role="alert">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || (action === 'emdad' && !requestedAt) || (action === 'market' && quoteOnly && !validUntil)}>{busy ? 'در حال ثبت…' : quoteOnly && action === 'market' ? 'ثبت قیمت پیشنهادی' : 'ثبت'}</button>
        <button className="btn" type="button" onClick={() => { setOpen(false); setChoice(null); }}>بستن</button>
      </div>
    </form>}
  </div>;
}
