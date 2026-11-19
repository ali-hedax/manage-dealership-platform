'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  PART_FLOW_FILTER_LABELS,
  PART_FLOW_FILTERS,
  PART_FLOW_NEXT_STEP,
  PART_FLOW_STATE_LABELS,
  formatJalaliDay,
  partActionLabel,
  partFlowFilter,
  toLatinDigits,
  type CaseDetail,
  type Part,
  type PartFlowAction,
  type PartFlowActionInput,
  type PartFlowFilter,
  type PartFlowState,
  type PartImportResult,
  type StockCandidate,
  type StockSnapshotInfo,
  STOCK_MATCH_LABELS,
} from '@manage/shared';
import { api, errorMessage, fetcher, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ReminderComposer } from './ReminderComposer';
import { AppIcon } from './AppIcon';
import { faNum, parseAmount, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { QuotePanel, QuoteProposal } from './WorkshopQuotes';
import { ReferenceLookup } from './ReferenceLookup';

const STATE_TONE: Record<PartFlowState, string> = {
  needed: 'wait',
  reserved: 'ok',
  emdad: 'em',
  emdad_arrived: 'wait',
  dealer_supply: 'stop',
  stock_parallel: 'ok',
  market: 'em',
  ready: 'ok',
  handed_over: 'ok',
  consumed: 'mute',
  cancelled: 'mute',
  returned: 'mute',
};

const rialText = (n: number | null | undefined) => (n == null ? '—' : `${faNum(n)} ریال`);
const dayText = (iso: string | null | undefined) => (iso ? formatJalaliDay(iso) : '');
const keyOf = (s: string) => toLatinDigits(s).replace(/[\s\-‌_./]/g, '').toUpperCase();

/** One-line readiness detail under the state tag (ETA, reservation, handover…). The special-aid stage has its own line. */
function stateDetail(p: Part): string {
  switch (p.flowState) {
    case 'emdad':
    case 'dealer_supply':
      return p.emdad ? '' : `ثبت امداد ویژه ${dayText(p.orderedAt)} · منتظر گزارش روزانه`;
    case 'stock_parallel':
      return `${faNum(p.stockParallel?.reservedQuantity ?? 0)} عدد از موجودی رزرو${p.stockParallel?.issuedQuantity ? ` · ${faNum(p.stockParallel.issuedQuantity)} عدد تحویل شد` : ''} · امداد ویژه جداگانه پیگیری می‌شود`;
    case 'emdad_arrived':
      return p.reservedQuantity > 0 ? `${faNum(p.reservedQuantity)} از ${faNum(p.quantity)} عدد رزرو شد؛ ${faNum(p.outstandingQuantity)} عدد باقی است` : 'هنوز رزرو نشده است';
    case 'market':
      return `${p.supplier ?? 'بازار'}${p.etaAt ? ` · رسیدن ${dayText(p.etaAt)}` : ''}`;
    case 'reserved':
      return p.source === 'company' ? 'رزرو برای همین خودرو · آمادهٔ تحویل' : `رزرو ${dayText(p.reservedAt)}`;
    case 'ready':
      // A legacy special-aid receipt date was the report date: it is not shown as a receipt date.
      return p.source === 'company' ? '' : `رسید ${dayText(p.receivedAt)}`;
    case 'handed_over':
    case 'consumed':
      return `${p.recipientName ?? ''}${p.handedOverDepartment ? ` (${p.handedOverDepartment.name})` : ''} · ${dayText(p.handedOverAt)}`;
    case 'cancelled':
      return p.cancelReason ?? '';
    case 'returned':
      return p.returnReason ?? '';
    default:
      return '';
  }
}

/**
 * Special-aid stage on the visible row (owner, 2026-11-17): the current stage from
 * the latest report, including stages before warehouse arrival. On a confirmed
 * arrival «امداد ویژه رسیده» with the actual warehouse receipt date right under
 * it; never the report or import date. Readiness stays on the state tag.
 */
function EmdadStage({ part: p }: { part: Part }) {
  if (!p.emdad) return null;
  if (p.emdad.arrived) {
    const received = p.emdad.receivedAt ?? p.emdadReceivedAt;
    return (
      <span className="emdad-stage" data-testid="emdad-stage">
        <b>امداد ویژه رسیده</b>
        {received && <span className="emdad-received" data-testid="emdad-received">{dayText(received)}</span>}
      </span>
    );
  }
  return <span className="emdad-stage" data-testid="emdad-stage"><b>{p.emdad.statusText ?? 'بدون متن وضعیت'}</b></span>;
}

/** The one button shown on the closed row; the rest live inside the row. */
function primaryAction(p: Part): PartFlowAction | 'decide' | null {
  // Rejected in the assessment and not supplied: no supply route to choose; only «لغو قطعه» stays in the details.
  if (p.assessmentRejection && p.flowState === 'needed') return null;
  if (p.flowState === 'needed' || p.flowState === 'dealer_supply') return 'decide';
  for (const a of ['hand_over', 'receive', 'return', 'reserve'] as const) if (p.allowedActions.includes(a)) return a;
  return null;
}

/**
 * The single parts list of a vehicle (spec section 7): first assessment,
 * supplements, reservation, Emdad Vijeh, market purchase, price and handover —
 * all on one list. The parts clerk acts; the accident expert reads, adds needs
 * and answers price announcements. Each row is one line; details open on demand.
 */
export function PartsLedger({ kase, onChange, title = 'فهرست قطعات', onFocusPart }: { kase: CaseDetail; onChange?: () => void; title?: string; onFocusPart?: (p: Part | null) => void }) {
  const { can } = useAuth();
  const { data: parts, mutate, error } = useSWR<Part[]>(`/cases/${kase.id}/parts`, fetcher);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PartFlowFilter | 'all'>('all');
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const editable = kase.status === 'open';
  const manage = editable && can('part.manage');

  const counts = useMemo(() => {
    const c: Record<PartFlowFilter, number> = { undecided: 0, in_progress: 0, ready: 0, delivered: 0 };
    for (const p of parts ?? []) {
      const f = partFlowFilter(p.flowState);
      if (f) c[f] += 1;
    }
    return c;
  }, [parts]);

  const visible = useMemo(() => {
    const term = keyOf(q.trim());
    const words = q.trim().split(/\s+/).filter(Boolean);
    return (parts ?? []).filter((p) => {
      const f = partFlowFilter(p.flowState);
      if (!showClosed && f === null) return false;
      if (filter !== 'all' && f !== filter) return false;
      if (!q.trim()) return true;
      const hay = `${p.description} ${p.notes ?? ''} ${p.supplier ?? ''}`;
      return (!!term && [p.partNumber, p.procurementCode, p.assessmentCode, p.emdadNo, p.emdad?.emdadNo].some((v) => keyOf(v ?? '').includes(term))) || words.every((w) => hay.includes(w));
    });
  }, [parts, q, filter, showClosed]);

  const closedCount = (parts ?? []).filter((p) => partFlowFilter(p.flowState) === null).length;
  const refresh = async () => {
    await mutate();
    onChange?.();
  };
  const toggle = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    onFocusPart?.(next ? (parts ?? []).find((p) => p.id === next) ?? null : null);
  };

  return (
    <section className="ledger" data-testid="parts-ledger" aria-labelledby="parts-ledger-title">
      <div className="ledger-tab"><h2 id="parts-ledger-title">{title}</h2><span>{faNum(parts?.length ?? 0)} قلم</span></div>
      <div className="ledger-sheet">
        <div className="ledger-tools">
          <AppIcon name="filter" className="ledger-filter-ico" />
          <div className="m-chips" role="group" aria-label="صافی قطعات">
            <button type="button" className="m-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              همه <span>{faNum((parts?.length ?? 0) - closedCount)}</span>
            </button>
            {PART_FLOW_FILTERS.map((f) => (
              <button key={f} type="button" className="m-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {PART_FLOW_FILTER_LABELS[f]} <span>{faNum(counts[f])}</span>
              </button>
            ))}
            {closedCount > 0 && (
              <button type="button" className="m-chip" aria-pressed={showClosed} onClick={() => setShowClosed((v) => !v)}>
                لغوشده و مرجوعی <span>{faNum(closedCount)}</span>
              </button>
            )}
          </div>
          <label className="srch ledger-search">
            <AppIcon name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی قطعه، کد فنی یا شمارهٔ امداد ویژه…" aria-label="جست‌وجو در قطعات" />
          </label>
          {editable && can('part.request') && <AddPart caseId={kase.id} onDone={refresh} />}
          {can('stock.read') && <PickingPrint caseId={kase.id} />}
        </div>
        {error && <p className="m-error" role="alert">دریافت فهرست قطعات ناموفق بود؛ صفحه را تازه کنید.</p>}
        {!parts && !error && <p className="m-empty" role="status">در حال دریافت قطعات…</p>}
        {parts && visible.length === 0 && <p className="m-empty">{parts.length ? 'قطعه‌ای با این صافی نیست.' : 'هنوز قطعه‌ای برای این خودرو ثبت نشده است.'}</p>}
        {visible.length > 0 && (
          <div className="ledger-thead" aria-hidden="true"><span>ردیف</span><span>نام قطعه</span><span>تعداد</span><span>قیمت (ریال)</span><span>وضعیت</span><span>عملیات</span></div>
        )}
        <div className="m-rows ledger-rows">
          {visible.map((p, i) => (
            <PartRow key={p.id} index={i + 1} kase={kase} part={p} manage={manage} expanded={open === p.id} onToggle={() => toggle(p.id)} onDone={refresh} />
          ))}
        </div>
        {/* Payer authorization for golden card / insurance (spec section 7): the clerk proposes a market price, the expert records the payer's answer. */}
        {manage && (kase.coverageType === 'golden_card' || kase.coverageType === 'insurance') && <QuoteProposal parts={(parts ?? []).filter((p) => p.flowState === 'needed')} onChange={() => void refresh()} />}
        <QuotePanel caseId={kase.id} />
      </div>
    </section>
  );
}

function PartRow({ index, kase, part: p, manage, expanded, onToggle, onDone }: { index: number; kase: CaseDetail; part: Part; manage: boolean; expanded: boolean; onToggle: () => void; onDone: () => Promise<void> }) {
  const { can } = useAuth();
  const [form, setForm] = useState<PartFlowAction | null>(null);
  const [reminding, setReminding] = useState(false);
  const primary = manage ? primaryAction(p) : null;
  const detail = stateDetail(p);
  const choose = (a: PartFlowAction) => {
    if (!expanded) onToggle();
    setForm(a);
  };
  const decideActions = p.allowedActions.filter((a) => a !== 'set_price' && a !== 'announce_price');
  return (
    <div className="m-row" id={`part-${p.id}`} data-testid="part" data-state={p.flowState}>
      <div className="m-row-head ledger-row" role="button" tabIndex={0} aria-label={`جزئیات ${p.description}`} aria-expanded={expanded} onClick={onToggle} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}>
        <span className="c-idx m-num">{faNum(index)}</span>
        <div className="m-row-name c-name">
          <span>{p.description}</span>
          {p.fromSupplement && <span className="m-badge">الحاقیه</span>}
          {p.assessmentRejection && <span className="m-badge stop" title="این قلم در کارشناسی رد شده است؛ نیاز تأمین حساب نمی‌شود">رد شده{p.assessmentRejection.versionNo > 1 ? ` · الحاقیه ${toPersianDigits(p.assessmentRejection.versionNo)}` : ""}</span>}
          {p.replaces && <span className="m-badge" title={p.replaces.probable ? "پیوند از روی کد فنی یکسان؛ قطعی نیست" : undefined}>جایگزین «{p.replaces.description}»{p.replaces.probable ? " · احتمالی" : ""}</span>}
          {p.priceNotice && <span className="m-tag wait">اعلام قیمت</span>}
          {p.codeCorrection?.status === 'open' && <span className="m-tag stop" data-testid="code-correction-badge">نیازمند اصلاح شماره فنی</span>}
          {p.displayCode && <small className="m-num m-muted" data-testid="part-code"><bdi dir="ltr">{toPersianDigits(p.displayCode)}</bdi></small>}
        </div>
        <span className="c-qty m-num"><span className="sr-only">تعداد </span>{faNum(p.quantity)}</span>
        <span className="c-price m-num"><span className="sr-only">قیمت فروش </span>{p.salePriceRial != null ? faNum(p.salePriceRial) : p.approvedUnitPriceRial != null ? faNum(p.approvedUnitPriceRial) : '—'}</span>
        <div className="m-row-state c-state">
          <span className={`m-tag ${STATE_TONE[p.flowState]}`}>{PART_FLOW_STATE_LABELS[p.flowState]}</span>
          {detail && <small>{detail}</small>}
          {(p.handedOverQuantity ?? 0) > 0 && (p.deliverableQuantity ?? 0) > 0 && <small>{faNum(p.handedOverQuantity!)} تحویل‌شده · {faNum(p.deliverableQuantity!)} آمادهٔ تحویل</small>}
          {p.stockParallel && p.flowState !== 'stock_parallel' && p.stockParallel.issuedQuantity > 0 && <small>تأمین از موجودی · امداد ویژه جایگزین موجودی انبار</small>}
          <EmdadStage part={p} />
          {p.emdadQuantityReview && <small className="m-tag wait" data-testid="emdad-quantity-review">تعداد رسیده نیازمند بررسی</small>}
        </div>
        <div className="m-row-action c-act" onClick={(e) => e.stopPropagation()}>
          {primary === 'decide' && <button type="button" className="m-btn-s part-primary" aria-expanded={expanded} onClick={onToggle}>انتخاب مسیر تأمین <AppIcon name="chevron-down" /></button>}
          {primary && primary !== 'decide' && <button type="button" className="m-btn-s part-primary" onClick={() => choose(primary)}>{partActionLabel(p.flowState, primary)} <AppIcon name={primary === 'hand_over' ? 'arrow-left' : primary === 'receive' ? 'receipt' : primary === 'reserve' ? 'box' : 'return'} /></button>}
          <AppIcon name="chevron-down" className={`ledger-caret${expanded ? ' up' : ''}`} />
        </div>
      </div>
      {expanded && (
        <div className="m-row-body">
          {manage && <div className="m-next"><b>قدم بعدی</b>{PART_FLOW_NEXT_STEP[p.flowState]}</div>}
          <h3 className="ledger-detail-title">جزئیات تأمین</h3>
          <dl className="m-dl ledger-dl">
            {p.procurementCode && (<><dt>کد تدارکاتی (۱۰ رقم)</dt><dd><bdi className="m-num" dir="ltr">{toPersianDigits(p.procurementCode)}</bdi></dd></>)}
            {p.assessmentCode && (<><dt>کد اختصاصی (کارشناسی، ۸ رقم)</dt><dd><bdi className="m-num" dir="ltr">{toPersianDigits(p.assessmentCode)}</bdi></dd></>)}
            {(!p.assessmentCode || (p.partNumber && p.partNumber !== p.assessmentCode && p.partNumber !== p.procurementCode)) && (<><dt>کد فنی</dt><dd><bdi className="m-num" dir="ltr">{toPersianDigits(p.partNumber ?? '—')}</bdi></dd></>)}
            {(p.emdadNo || p.emdad?.emdadNo) && (<><dt>شمارهٔ امداد ویژه</dt><dd data-testid="emdad-no"><bdi className="m-num">{toPersianDigits(p.emdadNo ?? p.emdad?.emdadNo ?? '')}</bdi></dd></>)}
            {p.emdad && (<><dt>آخرین وضعیت امداد ویژه</dt><dd>{p.emdad.statusText ?? '—'} <small className="m-muted">(تاریخ گزارش {dayText(p.emdad.reportAt)})</small></dd></>)}
            {p.emdadReserveNote && (<><dt>رزرو امداد ویژه</dt><dd className="emdad-ready-note">{p.emdadReserveNote}</dd></>)}
            {p.stockParallel && (<><dt>تأمین از موجودی</dt><dd data-testid="stock-parallel">{faNum(p.stockParallel.reservedQuantity)} عدد رزرو · {faNum(p.stockParallel.issuedQuantity)} عدد تحویل · از {dayText(p.stockParallel.at)}{p.stockParallel.replenished ? ' · امداد ویژه رسید و جایگزین موجودی انبار است' : ' · امداد ویژه همچنان فعال است'}</dd></>)}
            {p.codeCorrection?.status === 'resolved' && (<><dt>اصلاح شماره فنی</dt><dd><bdi className="m-num" dir="ltr">{p.codeCorrection.originalCode ?? '—'}</bdi> ← <bdi className="m-num" dir="ltr">{p.codeCorrection.correctedCode}</bdi> · {p.codeCorrection.resolvedBy?.displayName} · {dayText(p.codeCorrection.resolvedAt)}</dd></>)}
            {p.emdad?.history && p.emdad.history.length > 1 && (
              <>
                <dt>تاریخچهٔ وضعیت امداد ویژه</dt>
                <dd>
                  <ol className="ledger-emdad-history" aria-label="تاریخچهٔ وضعیت امداد ویژه از گزارش‌های روزانه">
                    {p.emdad.history.map((h, i) => <li key={`${h.at}-${i}`}>{h.statusText ?? '—'} · {dayText(h.at)}</li>)}
                  </ol>
                </dd>
              </>
            )}
            <dt>قیمت فروش</dt>
            <dd className="m-num">{rialText(p.salePriceRial)}</dd>
            {p.unitPriceRial != null && (<><dt>قیمت خرید</dt><dd className="m-num">{rialText(p.unitPriceRial)}{p.supplier ? ` · ${p.supplier}` : ''}</dd></>)}
            {p.approvedUnitPriceRial != null && (<><dt>مبلغ کارشناسی</dt><dd className="m-num">{rialText(p.approvedUnitPriceRial)}</dd></>)}
            <dt>ثبت نیاز</dt>
            <dd>{p.createdBy.displayName} · {dayText(p.createdAt)}</dd>
          </dl>
          {p.priceNotice && <PriceNoticeBox part={p} canAnswer={kase.status === 'open' && can('case.update')} onDone={onDone} />}
          {p.codeCorrection?.status === 'open' && <CorrectionBox part={p} canFix={kase.status === 'open' && can('assessment.manage')} onDone={onDone} />}
          {manage && decideActions.length > 0 && (
            <div className="m-actions" role="group" aria-label={`اقدام‌های ${p.description}`}>
              {decideActions.map((a) => (
                <button key={a} type="button" className={form === a ? 'm-btn-s' : a === 'cancel' || a === 'return' || a === 'release' ? 'm-btn2-s warn' : 'm-btn2-s'} aria-pressed={form === a} onClick={() => setForm(form === a ? null : a)}>
                  {partActionLabel(p.flowState, a)}
                </button>
              ))}
              {(['set_price', 'announce_price'] as const).filter((a) => p.allowedActions.includes(a)).map((a) => (
                <button key={a} type="button" className={form === a ? 'm-btn-s' : 'm-btn2-s'} aria-pressed={form === a} onClick={() => setForm(form === a ? null : a)}>
                  {partActionLabel(p.flowState, a)}
                </button>
              ))}
            </div>
          )}
          {manage && form && <FlowForm kase={kase} part={p} action={form} onCancel={() => setForm(null)} onDone={async () => { setForm(null); await onDone(); }} />}
          <div className="m-actions">
            <button type="button" className="m-btn2-s" onClick={() => setReminding(true)}>تذکر دربارهٔ این قطعه</button>
            {manage && !['cancelled', 'returned', 'consumed'].includes(p.flowState) && p.codeCorrection?.status !== 'open' && <PartMenu part={p} onDone={onDone} />}
          </div>
        </div>
      )}
      <ReminderComposer open={reminding} onClose={() => setReminding(false)} defaults={{ caseId: kase.id, caseLabel: kase.caseNumber, plate: kase.vehicle.plate, partId: p.id, partLabel: p.description, ...(manage ? { userIds: kase.responsible ? [kase.responsible.id] : [] } : { role: 'parts_clerk' as const }) }} />
    </div>
  );
}

/** One small form per action; the API checks the state machine again. */
function FlowForm({ kase, part: p, action, onCancel, onDone }: { kase: CaseDetail; part: Part; action: PartFlowAction; onCancel: () => void; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [key] = useState(newKey);
  const [v, setV] = useState<Record<string, string>>({});
  const [option, setOption] = useState<{ o: StockCandidate; snapshot: StockSnapshotInfo } | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const deliverable = p.deliverableQuantity ?? p.quantity;
  const amount = (k: string) => (v[k]?.trim() ? parseAmount(v[k]!) : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let body: PartFlowActionInput;
    const base = { expectedVersion: p.version };
    switch (action) {
      case 'reserve':
        if (!option) return setErr('یکی از کدهای موجود را انتخاب کنید');
        body = { ...base, action, snapshotId: option.snapshot.id, fullStockCode: option.o.fullStockCode, locationAddress: option.o.locationAddress, saleUnitRial: amount('sale') };
        break;
      case 'use_stock':
        if (!option) return setErr('یکی از کدهای موجود را انتخاب کنید');
        body = { ...base, action, snapshotId: option.snapshot.id, fullStockCode: option.o.fullStockCode, locationAddress: option.o.locationAddress, quantity: v.useQuantity ? Number(v.useQuantity) : undefined, saleUnitRial: amount('sale') };
        break;
      case 'release':
        body = { ...base, action, reason: v.reason ?? '' };
        break;
      case 'emdad':
        body = { ...base, action, emdadNo: v.emdadNo?.trim() ? toLatinDigits(v.emdadNo).trim() : undefined, requestedCode: v.code?.trim() ? toLatinDigits(v.code).trim() : undefined };
        break;
      case 'market':
        body = { ...base, action, supplier: v.supplier ?? '', purchaseUnitRial: amount('purchase') ?? 0, saleUnitRial: amount('sale') ?? 0 };
        break;
      case 'receive':
        body = { ...base, action, receiptDocNo: v.doc?.trim() || undefined };
        break;
      case 'hand_over':
        body = { ...base, action, recipientName: v.recipient ?? '', taskId: v.task || null, saleUnitRial: amount('sale'), ...(deliverable > 1 ? { deliveryQuantity: Number(v.deliveryQuantity) } : {}) };
        break;
      case 'cancel':
      case 'return':
        body = { ...base, action, reason: v.reason ?? '' };
        break;
      case 'set_price':
        body = { ...base, action, saleUnitRial: amount('sale') ?? 0 };
        break;
      case 'announce_price':
        body = { ...base, action, saleUnitRial: amount('sale') ?? 0, note: v.note?.trim() || undefined };
        break;
    }
    setBusy(true);
    setErr('');
    try {
      await api<Part>(`/parts/${p.id}/flow`, { body, idempotencyKey: key });
      toast(`${partActionLabel(p.flowState, action)} ثبت شد`);
      await onDone();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  const openTasks = (kase.tasks ?? []).filter((t) => t.status !== 'approved' && t.status !== 'cancelled');
  const salePlaceholder = p.salePriceRial != null ? toPersianDigits(String(p.salePriceRial)) : '';
  return (
    <form className="m-form" onSubmit={submit} aria-label={partActionLabel(p.flowState, action)}>
      {(action === 'reserve' || action === 'use_stock') && <StockChoice part={p} value={option} onChange={setOption} parallel={action === 'use_stock'} />}
      {action === 'use_stock' && (
        <>
          <p className="m-lbl" style={{ flexBasis: '100%', margin: 0 }}>قطعه از موجودی برای همین خودرو رزرو و آمادهٔ تحویل می‌شود؛ امداد ویژه لغو نمی‌شود و با رسیدن، جایگزین موجودی انبار است.</p>
          {p.quantity - p.reservedQuantity > 1 && <label className="m-field">تعداد از موجودی
            <select value={v.useQuantity ?? ''} onChange={set('useQuantity')}>
              <option value="">همهٔ باقی‌مانده (تا سقف این محل)</option>
              {Array.from({ length: p.quantity - p.reservedQuantity }, (_, i) => <option key={i + 1} value={i + 1}>{faNum(i + 1)} عدد</option>)}
            </select>
          </label>}
        </>
      )}
      {action === 'release' && <p className="m-lbl" style={{ flexBasis: '100%', margin: 0 }}>{p.flowState === 'stock_parallel' ? 'فقط رزرو موجودی لغو می‌شود؛ امداد ویژه با همان وضعیت و تاریخچه ادامه دارد.' : 'رزرو آزاد می‌شود و قطعه در همین پرونده با وضعیت «تعیین تکلیف نشده» می‌ماند.'}</p>}
      {action === 'emdad' && (
        <>
          <label className="m-field">شمارهٔ امداد ویژه<input inputMode="numeric" dir="ltr" value={v.emdadNo ?? ''} onChange={set('emdadNo')} /></label>
          <label className="m-field">کد تدارکاتی ۱۰ رقمی (اگر سازنده معلوم است)<input inputMode="numeric" dir="ltr" value={v.code ?? ''} onChange={set('code')} placeholder={p.procurementCode ?? ''} /></label>
          <p className="m-lbl" style={{ flexBasis: '100%', margin: 0 }}>اگر شمارهٔ امداد ویژه را هنوز ندارید خالی بگذارید؛ گزارش روزانه پس از تطبیق قطعی با شاسی و کد اختصاصی آن را پر می‌کند.</p>
        </>
      )}
      {action === 'market' && (
        <>
          <label className="m-field">فروشنده *<input required value={v.supplier ?? ''} onChange={set('supplier')} /></label>
          <label className="m-field">قیمت خرید واحد (ریال) *<input required inputMode="numeric" dir="ltr" value={v.purchase ?? ''} onChange={set('purchase')} /></label>
          <label className="m-field">قیمت فروش واحد (ریال) *<input required inputMode="numeric" dir="ltr" value={v.sale ?? ''} onChange={set('sale')} /></label>
          {(kase.coverageType === 'golden_card' || kase.coverageType === 'insurance') && <p className="m-warn" style={{ flexBasis: '100%', margin: 0 }}>کارت طلایی / بیمه: اگر از مبلغ کارشناسی گران‌تر است، کارشناس تصادفات مجوز پرداخت‌کننده را ثبت می‌کند. کار متوقف نمی‌شود.</p>}
        </>
      )}
      {action === 'receive' && <label className="m-field">شمارهٔ رسید (اختیاری)<input dir="ltr" value={v.doc ?? ''} onChange={set('doc')} /></label>}
      {action === 'hand_over' && (
        <>
          <label className="m-field">جایگاه / قدم تعمیر
            <select value={v.task ?? ''} onChange={set('task')}>
              <option value="">— بدون انتخاب —</option>
              {openTasks.map((t) => <option key={t.id} value={t.id}>{t.stationName ?? t.department.name}{t.title ? ` · ${t.title}` : ''}</option>)}
            </select>
          </label>
          {deliverable > 1 && <label className="m-field">تعداد تحویل به تعمیرگاه
            <select required value={v.deliveryQuantity ?? ''} onChange={set('deliveryQuantity')}>
              <option value="">تعداد را انتخاب کنید</option>
              {Array.from({ length: deliverable }, (_, i) => <option key={i + 1} value={i + 1}>{faNum(i + 1)} عدد</option>)}
            </select>
          </label>}
          <label className="m-field">تحویل‌گیرنده *<input required value={v.recipient ?? ''} onChange={set('recipient')} /></label>
          {p.salePriceRial == null && <label className="m-field">قیمت فروش واحد (ریال) *<input required inputMode="numeric" dir="ltr" value={v.sale ?? ''} onChange={set('sale')} /></label>}
        </>
      )}
      {(action === 'cancel' || action === 'return' || action === 'release') && (
        <label className="m-field" style={{ flexBasis: '100%' }}>علت {action === 'return' ? 'مرجوعی' : action === 'release' ? 'لغو رزرو' : 'لغو'} *<input required minLength={3} value={v.reason ?? ''} onChange={set('reason')} /></label>
      )}
      {(action === 'set_price' || action === 'announce_price') && (
        <>
          <label className="m-field">قیمت فروش واحد (ریال) *<input required inputMode="numeric" dir="ltr" value={v.sale ?? ''} onChange={set('sale')} placeholder={salePlaceholder} /></label>
          {action === 'announce_price' && <label className="m-field">توضیح برای کارشناس<input value={v.note ?? ''} onChange={set('note')} /></label>}
        </>
      )}
      {err && <p className="m-error" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{err}</p>}
      <div className="m-actions" style={{ flexBasis: '100%' }}>
        <button type="submit" className="m-btn-s" disabled={busy}>{busy ? 'در حال ثبت…' : action === 'set_price' ? 'ذخیرهٔ قیمت' : partActionLabel(p.flowState, action)}</button>
        <button type="button" className="m-btn2-s" onClick={onCancel}>انصراف</button>
        {action === 'set_price' && (
          <span className="m-lbl" style={{ alignSelf: 'center' }}>تغییر قیمت بی‌پیام است؛ برای خبر دادن به کارشناس «اعلام قیمت» را بزنید.</span>
        )}
      </div>
    </form>
  );
}

/**
 * Stock choice of one line (spec section 7; owner, 2026-11-18). The server lists the
 * candidates of this part read now: the exact code, OEM variants of the same 8-digit
 * assessment code and possible non-OEM matches («غیرشرکتی · احتمالاً معادل»), each code
 * and location separately with usable and reserved quantity. Only a single OEM option
 * is preselected; a non-OEM candidate is always an explicit choice.
 */
function StockChoice({ part, value, onChange, parallel = false }: { part: Part; value: { o: StockCandidate; snapshot: StockSnapshotInfo } | null; onChange: (v: { o: StockCandidate; snapshot: StockSnapshotInfo } | null) => void; parallel?: boolean }) {
  // An arrived special-aid line and stock used beside special aid may take what is available now.
  const minimum = part.flowState === 'emdad_arrived' || parallel ? 1 : part.quantity;
  const coded = !!(part.partNumber || part.procurementCode);
  const [q, setQ] = useState(coded ? '' : part.description);
  const url = coded ? `/parts/${part.id}/stock-candidates?v=${part.version}` : q.trim().length >= 2 ? `/stock/options?q=${encodeURIComponent(q.trim())}&pageSize=30` : null;
  const { data, error } = useSWR<{ snapshot: StockSnapshotInfo | null; base?: string | null; items: StockCandidate[] }>(url, fetcher, {
    revalidateOnFocus: false,
    onSuccess: (d) => {
      const usable = d.items.filter((o) => Number(o.available) >= minimum);
      if (!value && d.snapshot && usable.length === 1 && usable[0]!.match !== 'non_oem') onChange({ o: usable[0]!, snapshot: d.snapshot });
    },
  });
  return (
    <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {coded ? (
        <span className="m-lbl">موجودی تطبیق‌یافته با این قطعه{data?.base ? <> (کد اختصاصی <bdi>{toPersianDigits(data.base)}</bdi>)</> : null}. شرکتی یا غیرشرکتی بودن هر کالا کنارش آمده است؛ کالای غیرشرکتی فقط با انتخاب شما رزرو می‌شود.</span>
      ) : (
        <label className="m-field">جست‌وجوی موجودی (کد یا نام)<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
      )}
      {error && <p className="m-error" role="alert">دریافت موجودی ناموفق بود.</p>}
      {data && !data.snapshot && <p className="m-warn">گزارش موجودی امروز بارگذاری نشده است.</p>}
      {data?.snapshot && data.items.length === 0 && <p className="m-empty">موجودی قابل‌استفاده‌ای برای این کد نیست.</p>}
      {data?.snapshot && data.items.map((o) => {
        const enough = Number(o.available) >= minimum;
        const held = (o.reservedFor ?? []).filter((h) => h.caseId !== part.caseId);
        const selected = !!value && value.o.fullStockCode === o.fullStockCode && value.o.locationAddress === o.locationAddress;
        const oem = o.oem ?? o.codeKind === 'standard';
        return (
          <label key={`${o.fullStockCode}@${o.locationAddress}`} className="m-option" aria-disabled={!enough} data-testid="stock-candidate" data-match={o.match ?? ''}>
            <input type="radio" name={`stock-${part.id}`} disabled={!enough} checked={selected} onChange={() => onChange({ o, snapshot: data.snapshot! })} />
            <span>
              <bdi className="m-num" dir="ltr" style={{ fontWeight: 700 }}>{toPersianDigits(o.fullStockCode)}</bdi> · {o.description ?? ''}
              {' '}<span className={`m-badge${oem ? '' : ' stop'}`}>{oem ? 'شرکتی' : 'غیرشرکتی'}</span>
              {o.match && <> <span className="m-badge">{STOCK_MATCH_LABELS[o.match]}</span></>}
              <br />
              <small className="m-muted">محل {o.locationAddress ? <bdi dir="ltr">{o.locationAddress}</bdi> : o.locationText || 'ثبت نشده'}{Number(o.reserved) > 0 ? ` · رزروشده ${toPersianDigits(o.reserved)}` : ''}{held.length ? ` · رزرو فعال برای پروندهٔ ${held.map((h) => toPersianDigits(h.caseNumber)).join('، ')}` : ''}</small>
            </span>
            <span style={{ textAlign: 'end' }}>
              <b className="m-num">{toPersianDigits(o.available)}</b> <small className="m-muted">قابل‌استفاده</small>
              <br />
              <small className="m-num">{o.salePrice ? `${toPersianDigits(Number(o.salePrice).toLocaleString('en-US'))} ریال` : 'بی‌قیمت'}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** «چاپ لیست برداشت قطعات»: A4 PDF read from the server now; printing changes nothing. */
function PickingPrint({ caseId }: { caseId: string }) {
  return (
    <details className="m-menu no-print">
      <summary className="m-btn2-s"><AppIcon name="receipt" /> چاپ لیست برداشت قطعات</summary>
      <div className="m-menu-pop" role="group" aria-label="چاپ لیست برداشت قطعات">
        <a className="m-btn2-s" href={`/api/v1/print/cases/${caseId}/picking.pdf`} target="_blank" rel="noopener">قطعات قابل برداشت</a>
        <a className="m-btn2-s" href={`/api/v1/print/cases/${caseId}/picking.pdf?scope=all`} target="_blank" rel="noopener">همهٔ قطعات خودرو</a>
      </div>
    </details>
  );
}

/** «⋯» menu of a line: rarely used actions stay out of sight («درخواست اصلاح شماره فنی»). */
function PartMenu({ part: p, onDone }: { part: Part; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [key] = useState(newKey);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api(`/parts/${p.id}/code-correction`, { body: { expectedVersion: p.version, reason: reason.trim() }, idempotencyKey: key });
      toast('درخواست اصلاح برای کارشناس فرستاده شد');
      setOpen(false);
      await onDone();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <details className="m-menu">
        <summary className="m-btn2-s" aria-label={`اقدام‌های بیشتر ${p.description}`}>⋯</summary>
        <div className="m-menu-pop" role="menu">
          <button type="button" role="menuitem" className="m-btn2-s" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setOpen(true); }}>درخواست اصلاح شماره فنی</button>
        </div>
      </details>
      {open && (
        <form className="m-form" onSubmit={send} style={{ flexBasis: '100%' }} aria-label="درخواست اصلاح شماره فنی">
          <p className="m-lbl" style={{ flexBasis: '100%', margin: 0 }}>فقط همین قطعه با شمارهٔ <bdi dir="ltr">{p.partNumber ?? '—'}</bdi> برای اصلاح به کارشناس برمی‌گردد.</p>
          <label className="m-field" style={{ flexBasis: '100%' }}>علت کوتاه *<input required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="شماره فنی ثبت‌شده با مدل خودرو مطابقت ندارد. لطفاً بررسی و اصلاح شود." /></label>
          {err && <p className="m-error" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{err}</p>}
          <div className="m-actions" style={{ flexBasis: '100%' }}>
            <button type="submit" className="m-btn-s" disabled={busy || reason.trim().length < 5}>{busy ? 'در حال ارسال…' : 'ارسال برای کارشناس'}</button>
            <button type="button" className="m-btn2-s" onClick={() => setOpen(false)}>انصراف</button>
          </div>
        </form>
      )}
    </>
  );
}

/** The expert's side: original code, the clerk's reason and «ثبت و ارسال مجدد». */
function CorrectionBox({ part: p, canFix, onDone }: { part: Part; canFix: boolean; onDone: () => Promise<void> }) {
  const c = p.codeCorrection!;
  const toast = useToast();
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [key] = useState(newKey);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api(`/code-corrections/${c.id}/resolve`, { body: { expectedVersion: p.version, correctedCode: toLatinDigits(code.trim()) }, idempotencyKey: key });
      toast('شماره فنی اصلاح و برای مسئول قطعات فرستاده شد');
      await onDone();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="m-warn" data-testid="code-correction">
      <b>نیازمند اصلاح شماره فنی</b> — {c.requestedBy.displayName} · {dayText(c.requestedAt)}
      <div>شمارهٔ ثبت‌شده: <bdi className="m-num" dir="ltr">{c.originalCode ?? '—'}</bdi></div>
      <div>علت: {c.reason}</div>
      {c.blockers.length > 0 && <ul style={{ margin: '4px 0', paddingInlineStart: 18 }}>{c.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      {canFix && c.blockers.length === 0 && (
        <form className="m-form" onSubmit={send} style={{ marginBlockStart: 8 }} aria-label="اصلاح شماره فنی">
          <label className="m-field">شماره فنی درست *<input required dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <button type="submit" className="m-btn-s" disabled={busy || code.trim().length < 3}>{busy ? 'در حال ثبت…' : 'ثبت و ارسال مجدد'}</button>
        </form>
      )}
      {err && <p className="m-error" role="alert">{err}</p>}
    </div>
  );
}

function PriceNoticeBox({ part, canAnswer, onDone }: { part: Part; canAnswer: boolean; onDone: () => Promise<void> }) {
  const n = part.priceNotice!;
  const toast = useToast();
  const [mode, setMode] = useState<'instruction' | null>(null), [text, setText] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  async function answer(response: 'approved' | 'instruction') {
    setBusy(true);
    setErr('');
    try {
      await api(`/price-notices/${n.id}/respond`, { body: { expectedVersion: n.version, response, instruction: response === 'instruction' ? text.trim() : undefined } });
      toast('پاسخ ثبت شد');
      await onDone();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="m-warn" data-testid="price-notice">
      <b>اعلام قیمت:</b> «این را به <span className="m-num">{rialText(n.saleUnitRial)}</span> می‌فروشم» — {n.announcedBy.displayName} · {dayText(n.announcedAt)}
      {n.note && <div>{n.note}</div>}
      {canAnswer && (
        <div className="m-actions" style={{ marginBlockStart: 8 }}>
          <button type="button" className="m-btn-s" disabled={busy} onClick={() => answer('approved')}>تأیید قیمت</button>
          <button type="button" className="m-btn2-s" disabled={busy} onClick={() => setMode(mode ? null : 'instruction')}>دستور دیگر</button>
        </div>
      )}
      {mode === 'instruction' && (
        <div className="m-form" style={{ marginBlockStart: 8 }}>
          <label className="m-field">دستور (مثلاً از فروشگاه فلان بخرید یا امداد ویژه بزنید)<input value={text} onChange={(e) => setText(e.target.value)} /></label>
          <button type="button" className="m-btn-s" disabled={busy || !text.trim()} onClick={() => answer('instruction')}>ثبت دستور</button>
        </div>
      )}
      {err && <p className="m-error" role="alert">{err}</p>}
      <div className="m-lbl" style={{ marginBlockStart: 4 }}>پاسخ ندادن کار را متوقف نمی‌کند؛ فقط ثبت می‌شود.</div>
    </div>
  );
}

/** The expert adds a need (single) or a sheet with preview; the same code never makes a second row. */
function AddPart({ caseId, onDone }: { caseId: string; onDone: () => Promise<void> }) {
  const toast = useToast();
  const { can } = useAuth();
  const [open, setOpen] = useState<'one' | 'sheet' | null>(null);
  const [desc, setDesc] = useState(''), [code, setCode] = useState(''), [qty, setQty] = useState('1');
  const [file, setFile] = useState<string | null>(null), [preview, setPreview] = useState<PartImportResult | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    // Both the part name and its technical code are required (owner, 2026-11-19); the code stays a string.
    if (!desc.trim() || !code.trim()) { setErr(!desc.trim() ? 'نام قطعه را وارد کنید.' : 'کد فنی قطعه را وارد کنید.'); return; }
    setBusy(true);
    setErr('');
    try {
      await api(`/cases/${caseId}/parts`, { body: { description: desc.trim(), partNumber: toLatinDigits(code.trim()), quantity: Math.max(1, parseAmount(qty) || 1), source: 'company' } });
      toast('قطعه به فهرست اضافه شد');
      setDesc('');
      setCode('');
      setQty('1');
      await onDone();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  async function pick(f: File | undefined) {
    setPreview(null);
    setErr('');
    if (!f) return setFile(null);
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    setFile(b64);
    setBusy(true);
    try {
      setPreview(await api<PartImportResult>(`/cases/${caseId}/parts/import`, { body: { fileBase64: b64, dryRun: true } }));
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  async function importSheet() {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const r = await api<PartImportResult>(`/cases/${caseId}/parts/import`, { body: { fileBase64: file, dryRun: false } });
      toast(`${faNum(r.created)} قلم تازه وارد شد${r.duplicates.length ? `؛ ${faNum(r.duplicates.length)} قلم تکراری کنار گذاشته شد` : ''}`);
      setOpen(null);
      setFile(null);
      setPreview(null);
      await onDone();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="m-actions">
      <button type="button" className="m-btn2-s" aria-pressed={open === 'one'} onClick={() => setOpen(open === 'one' ? null : 'one')}>افزودن قطعه</button>
      <button type="button" className="m-btn2-s" aria-pressed={open === 'sheet'} onClick={() => setOpen(open === 'sheet' ? null : 'sheet')}>ورود از اکسل</button>
      {open === 'one' && (
        <form className="m-form" onSubmit={addOne} style={{ flexBasis: '100%' }} aria-label="افزودن قطعه">
          {can('reference.parts.read') && <details className="compact-disclosure" style={{ flexBasis: '100%' }}><summary>انتخاب از کاتالوگ قطعات</summary><ReferenceLookup kind="parts" onSelect={r => { setCode(r.data.partNumber || ''); setDesc(r.data.description || ''); toast('کد و نام قطعه انتخاب شد؛ تعداد را مشخص کنید'); }} /></details>}
          <label className="m-field">نام قطعه *<input required value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          <label className="m-field">کد فنی قطعه *<input required dir="ltr" maxLength={80} value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="m-field" style={{ flex: '0 1 90px' }}>تعداد<input inputMode="numeric" dir="ltr" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          <button type="submit" className="m-btn-s" disabled={busy || !desc.trim() || !code.trim()} title={!desc.trim() || !code.trim() ? 'نام قطعه و کد فنی قطعه هر دو الزامی‌اند' : undefined}>افزودن</button>
          {(!desc.trim() || !code.trim()) && <p className="small muted" style={{ flexBasis: '100%', margin: 0 }}>نام قطعه و کد فنی قطعه هر دو الزامی‌اند.</p>}
          {err && <p className="m-error" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{err}</p>}
        </form>
      )}
      {open === 'sheet' && (
        <div className="m-form" style={{ flexBasis: '100%' }}>
          <label className="m-field">فایل اکسل (.xlsx)<input type="file" accept=".xlsx" onChange={(e) => void pick(e.target.files?.[0])} /></label>
          {preview && (
            <p data-testid="import-preview" style={{ flexBasis: '100%', margin: 0 }}>
              {faNum(preview.rows.length)} قلم تازه{preview.duplicates.length ? `، ${faNum(preview.duplicates.length)} قلم تکراری کنار گذاشته شد` : ''}
              {preview.errors.length ? ` · ${faNum(preview.errors.length)} خطا` : ''}
            </p>
          )}
          {preview && !preview.errors.length && preview.rows.length > 0 && <button type="button" className="m-btn-s" disabled={busy} onClick={importSheet}>تأیید و ورود</button>}
          {err && <p className="m-error" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{err}</p>}
        </div>
      )}
    </div>
  );
}
