'use client';

import { useState,useEffect } from 'react';
import useSWR,{useSWRConfig} from 'swr';
import {
  ASSESSMENT_ITEM_ACTION_LABELS,
  ASSESSMENT_KIND_LABELS,
  AUTHORIZATION_METHOD_LABELS,
  AUTHORIZATION_METHODS,
  AUTHORIZATION_SOURCE_LABELS,
  AUTHORIZATION_SOURCES,
  AUTHORIZATION_STATUS_LABELS,
  ITEM_APPROVAL_LABELS,
  assessmentDispatchLines,
  type AssessmentDispatchLine,
  type Part,
  type Assessment,
  type AssessmentItem,
  type AssessmentItemAction,
  type AuthorizationDecision,
  type AuthorizationMethod,
  type AuthorizationSource,
  type AuthorizationStatus,
  type CaseDetail,
  type Department,
} from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali, parseAmount, rial, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Dialog } from './Dialog';
import { JalaliInput } from './JalaliInput';
import { AssessmentImport } from './AssessmentImport';
import { StockFamilyPreview } from './CaseStockPanel';

const AUTH_TONE: Record<AuthorizationStatus, string> = {
  not_required: 'chip-green',
  pending: 'chip-amber',
  approved: 'chip-green',
  partially_approved: 'chip-amber',
  rejected: 'chip-red',
};

const DECISION_LABELS: Record<AuthorizationDecision, string> = {
  approved: 'تأیید کامل',
  partially_approved: 'تأیید جزئی',
  rejected: 'رد',
};


const defaultSource = (k: CaseDetail): AuthorizationSource =>
  k.coverageType === 'golden_card' ? 'golden_card' : k.coverageType === 'personal' ? 'customer' : 'insurer';

type ItemForm = {
  action: AssessmentItemAction;
  description: string;
  partNumber: string;
  quantity: string;
  unitPrice: string;
  labourDepartmentId: string;
  labour: string;
  evidence: string;
};

const emptyItem: ItemForm = {
  action: 'replace',
  description: '',
  partNumber: '',
  quantity: '1',
  unitPrice: '',
  labourDepartmentId: '',
  labour: '',
  evidence: '',
};

type Mode =
  | { kind: 'new'; assessmentKind: 'initial' | 'supplement' }
  | { kind: 'item'; a: Assessment; item: AssessmentItem | null }
  | { kind: 'finalize'; a: Assessment }
  | { kind: 'authorize'; a: Assessment }
  | null;

export function AssessmentPanel({ kase, onChange }: { kase: CaseDetail; onChange: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: versions, mutate } = useSWR<Assessment[]>(`/cases/${kase.id}/assessments`, fetcher);
  const { data: departments } = useSWR<Department[]>('/departments', fetcher);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const {mutate:refreshCache}=useSWRConfig();
  const {data:requests}=useSWR<Part[]>(can('part.request')?`/cases/${kase.id}/parts`:null,fetcher);
  const [selected,setSelected]=useState<string[]>([]),[sending,setSending]=useState(false);

  // Dialog state.
  const [assessorName, setAssessorName] = useState('');
  const [assessorOrg, setAssessorOrg] = useState('');
  const [reason, setReason] = useState('');
  const [at, setAt] = useState<string | null>(null);
  const [item, setItem] = useState<ItemForm>(emptyItem);
  const [forecast, setForecast] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<AuthorizationDecision>('approved');
  const [source, setSource] = useState<AuthorizationSource>('insurer');
  const [method, setMethod] = useState<AuthorizationMethod>('official_system');
  const [reference, setReference] = useState('');
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const manage = can('assessment.manage');
  const editable = kase.status === 'open' && kase.stage !== 'delivered';
  const list = versions ?? [];
  const current = list.at(-1);
  const older = list.slice(0, -1).reverse();
  const dispatchLines=current&&requests?assessmentDispatchLines(current.items,list.flatMap(a=>a.items),requests):[];
  useEffect(()=>{setSelected([]);},[current?.id,current?.version]);
  async function dispatchParts(){
    if(!current||!selected.length||sending)return;setSending(true);
    try{const items=await api<Part[]>(`/cases/${kase.id}/parts/from-assessment`,{body:{assessmentId:current.id,expectedVersion:current.version,itemIds:selected}});await refreshCache(`/cases/${kase.id}/parts`,items,{revalidate:false});await mutate();setSelected([]);onChange();toast('اقلام انتخابی به قطعات و تأمین ارسال شدند');window.location.hash='case-parts';}
    catch(e){toast(errorMessage(e),'error');void refreshCache(`/cases/${kase.id}/parts`);void mutate();}finally{setSending(false);}
  }

  function start(m: NonNullable<Mode>) {
    setMode(m);
    setNote('');
    setAt(new Date().toISOString());
    if (m.kind === 'new') {
      setAssessorName(current?.assessorName ?? '');
      setAssessorOrg(current?.assessorOrg ?? kase.insurerName ?? '');
      setReason('');
    } else if (m.kind === 'item') {
      const i = m.item;
      setItem(
        i
          ? {
              action: i.action,
              description: i.description,
              partNumber: i.partNumber ?? '',
              quantity: String(i.quantity),
              unitPrice: i.unitPriceRial ? String(i.unitPriceRial) : '',
              labourDepartmentId: i.labourDepartment?.id ?? '',
              labour: i.labourRial ? String(i.labourRial) : '',
              evidence: i.evidence ?? '',
            }
          : emptyItem,
      );
    } else if (m.kind === 'finalize') {
      setForecast(kase.forecastDeliveryAt);
    } else if (m.kind === 'authorize') {
      setDecision('approved');
      const s = defaultSource(kase);
      setSource(s);
      setMethod(s === 'customer' ? 'in_person' : 'official_system');
      setReference('');
      setRejected(new Set());
    }
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
      setMode(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
      void mutate();
      onChange();
    }
  }

  async function submit() {
    if (!mode) return;
    if (mode.kind === 'new') {
      await run(
        () =>
          api(`/cases/${kase.id}/assessments`, {
            body: {
              kind: mode.assessmentKind,
              assessorName,
              assessorOrg: assessorOrg || null,
              assessedAt: mode.assessmentKind === 'initial' ? at : undefined,
              discoveredAt: mode.assessmentKind === 'supplement' ? at : undefined,
              reason: reason || null,
            },
          }),
        mode.assessmentKind === 'supplement' ? 'پیش‌نویس الحاقیه ایجاد شد' : 'پیش‌نویس کارشناسی ایجاد شد',
      );
    } else if (mode.kind === 'item') {
      const body = {
        expectedVersion: mode.a.version,
        action: item.action,
        description: item.description,
        partNumber: item.partNumber || null,
        quantity: Math.max(1, parseAmount(item.quantity)),
        unitPriceRial: parseAmount(item.unitPrice),
        labourDepartmentId: item.labourDepartmentId || null,
        labourRial: parseAmount(item.labour),
        evidence: item.evidence || null,
      };
      await run(
        () =>
          mode.item
            ? api(`/assessment-items/${mode.item.id}`, { method: 'PATCH', body })
            : api(`/assessments/${mode.a.id}/items`, { body }),
        mode.item ? 'قلم ویرایش شد' : 'قلم اضافه شد',
      );
    } else if (mode.kind === 'finalize') {
      await run(
        () =>
          api(`/assessments/${mode.a.id}/finalize`, {
            body: {
              expectedVersion: mode.a.version,
              forecastDeliveryAt: forecast !== kase.forecastDeliveryAt ? forecast : undefined,
              note: note || null,
            },
          }),
        'کارشناسی نهایی شد',
      );
    } else {
      await run(
        () =>
          api(`/assessments/${mode.a.id}/authorization`, {
            body: {
              expectedVersion: mode.a.version,
              decision,
              source,
              method,
              reference: reference || null,
              at,
              rejectedItemIds: decision === 'partially_approved' ? [...rejected] : [],
              note: note || null,
            },
          }),
        'تصمیم مجوز ثبت شد',
      );
    }
  }

  async function remove(a: Assessment, i: AssessmentItem) {
    if (!window.confirm(`قلم «${i.description}» از پیش‌نویس حذف شود؟`)) return;
    await run(
      () => api(`/assessment-items/${i.id}/remove`, { body: { expectedVersion: a.version } }),
      'قلم از پیش‌نویس حذف شد',
    );
  }

  const canSubmit = (() => {
    if (!mode) return false;
    if (mode.kind === 'new') return !!assessorName.trim() && (mode.assessmentKind === 'initial' || !!reason.trim());
    if (mode.kind === 'item') return !!item.description.trim();
    if (mode.kind === 'authorize') {
      if (source !== 'customer' && !reference.trim()) return false;
      if (decision !== 'approved' && !note.trim()) return false;
      if (decision === 'partially_approved' && !rejected.size) return false;
    }
    return true;
  })();

  const dialogTitle = !mode
    ? ''
    : mode.kind === 'new'
      ? mode.assessmentKind === 'supplement'
        ? 'ثبت الحاقیه (آسیب پنهان)'
        : 'شروع کارشناسی اولیه'
      : mode.kind === 'item'
        ? mode.item
          ? 'ویرایش قلم'
          : 'افزودن قلم'
        : mode.kind === 'finalize'
          ? `نهایی کردن ${ASSESSMENT_KIND_LABELS[mode.a.kind]}`
          : 'ثبت تصمیم مجوز';

  return (
    <section className="panel" data-testid="assessment-panel">
      <div className="panel-head">
        <h2>کارشناسی و الحاقیه</h2>
        {manage && editable && versions && (
          <div className="row" style={{ gap: 6 }}>
            {!current && (
              <button className="btn btn-sm" onClick={() => start({ kind: 'new', assessmentKind: 'initial' })}>
                شروع کارشناسی
              </button>
            )}
            {current && current.status !== 'draft' && (
              <button className="btn btn-sm" onClick={() => start({ kind: 'new', assessmentKind: 'supplement' })}>
                ثبت الحاقیه (آسیب پنهان)
              </button>
            )}
          </div>
        )}
      </div>

      {!versions && <div className="panel-body muted small">در حال بارگذاری…</div>}
      {versions && !current && (
        <div className="panel-body muted small">
          کارشناسی ثبت نشده است.
          {manage && editable ? ' با «شروع کارشناسی» اقلام تعویض و تعمیر را ثبت کنید.' : ''}
        </div>
      )}

      {current && (
        <>
        {manage && editable && current.status === 'draft' && <div className="assessment-import-entry"><button type="button" className="btn btn-sm" onClick={() => setImporting(true)}>دریافت اکسل کارشناسی</button><span className="xs muted">قطعات و اجرت از خروجی PDF</span></div>}
        <Version
          a={current}
          editable={editable}
          manage={manage}
          authorize={can('assessment.authorize')}
          onItem={(i) => start({ kind: 'item', a: current, item: i })}
          onRemove={(i) => remove(current, i)}
          onFinalize={() => start({ kind: 'finalize', a: current })}
          onAuthorize={() => start({ kind: 'authorize', a: current })}
          dispatch={can('part.request')&&editable&&requests?{lines:dispatchLines,selected,onToggle:id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]),onAll:checked=>setSelected(checked?dispatchLines.filter(l=>l.state==='ready').map(l=>l.itemId):[]),onSend:()=>void dispatchParts(),busy:sending}:undefined}
        />
        </>
      )}

      {importing && current && <AssessmentImport assessment={current} onClose={() => setImporting(false)} onDone={() => { setImporting(false); void mutate(); onChange(); toast('کارشناسی با فایل تطبیق داده شد؛ قطعات موردنظر را انتخاب و ارسال کنید'); }} />}

      {older.length > 0 && (
        <details>
          <summary className="panel-body small muted" style={{ cursor: 'pointer', paddingBlock: 10 }}>
            نسخه‌های قبلی ({toPersianDigits(older.length)}) — بدون تغییر حفظ شده‌اند
          </summary>
          {older.map((a) => (
            <Version key={a.id} a={a} editable={false} manage={false} authorize={false} />
          ))}
        </details>
      )}

      <Dialog
        open={!!mode}
        title={dialogTitle}
        onClose={() => setMode(null)}
        footer={
          <>
            <button className="btn btn-primary" disabled={busy || !canSubmit} onClick={submit}>
              {mode?.kind === 'finalize' ? 'نهایی کردن' : 'ثبت'}
            </button>
            <button className="btn" onClick={() => setMode(null)}>
              انصراف
            </button>
          </>
        }
      >
        {mode?.kind === 'new' && (
          <>
            {mode.assessmentKind === 'supplement' && (
              <label className="field">
                <span>شرح آسیب پنهان *</span>
                <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
                <span className="hint">اقلام نسخه فعلی کپی می‌شوند و نسخه فعلی بدون تغییر حفظ می‌شود.</span>
              </label>
            )}
            <JalaliInput
              label={mode.assessmentKind === 'supplement' ? 'زمان کشف آسیب' : 'زمان کارشناسی'}
              value={at}
              onChange={setAt}
              withTime
              nowButton
            />
            <div className="grid-2">
              <label className="field">
                <span>نام کارشناس *</span>
                <input className="input" value={assessorName} onChange={(e) => setAssessorName(e.target.value)} />
              </label>
              <label className="field">
                <span>سازمان کارشناس</span>
                <input
                  className="input"
                  value={assessorOrg}
                  placeholder="بیمه، امداد خودرو یا نمایندگی"
                  onChange={(e) => setAssessorOrg(e.target.value)}
                />
              </label>
            </div>
          </>
        )}

        {mode?.kind === 'item' && (
          <>
            <div className="segmented" role="group" aria-label="نوع قلم">
              {(['replace', 'repair'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={item.action === k}
                  onClick={() => setItem({ ...item, action: k })}
                >
                  {ASSESSMENT_ITEM_ACTION_LABELS[k]}
                </button>
              ))}
            </div>
            <label className="field">
              <span>شرح *</span>
              <input
                className="input"
                value={item.description}
                onChange={(e) => setItem({ ...item, description: e.target.value })}
              />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>شماره فنی قطعه</span>
                <input
                  className="input ltr-input"
                  value={item.partNumber}
                  onChange={(e) => setItem({ ...item, partNumber: e.target.value })}
                />
              </label>
              <label className="field">
                <span>تعداد</span>
                <input
                  className="input ltr-input"
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(e) => setItem({ ...item, quantity: e.target.value })}
                />
              </label>
              <label className="field">
                <span>قیمت واحد قطعه (ریال)</span>
                <input
                  className="input ltr-input"
                  inputMode="numeric"
                  value={item.unitPrice}
                  onChange={(e) => setItem({ ...item, unitPrice: e.target.value })}
                />
              </label>
              <label className="field">
                <span>اجرت (ریال)</span>
                <input
                  className="input ltr-input"
                  inputMode="numeric"
                  value={item.labour}
                  onChange={(e) => setItem({ ...item, labour: e.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>واحد اجرت</span>
              <select
                className="input"
                value={item.labourDepartmentId}
                onChange={(e) => setItem({ ...item, labourDepartmentId: e.target.value })}
              >
                <option value="">—</option>
                {(departments ?? [])
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>مستندات</span>
              <input
                className="input"
                value={item.evidence}
                placeholder="شماره عکس یا محل نگهداری مدرک"
                onChange={(e) => setItem({ ...item, evidence: e.target.value })}
              />
            </label>
            <div className="small muted">
              جمع این قلم:{' '}
              {rial(Math.max(1, parseAmount(item.quantity)) * parseAmount(item.unitPrice) + parseAmount(item.labour))}
            </div>
          </>
        )}

        {mode?.kind === 'finalize' && (
          <>
            <div className="callout callout-blue small">
              پس از نهایی‌شدن، اصلاح اقلام با الحاقیه انجام می‌شود. ثبت کارشناسی و ارسال قطعه مجوز جدا نمی‌خواهد؛ تأیید قیمت برای خرید بیرون در بخش قطعات ثبت می‌شود.
            </div>
            <div className="small">
              جمع کل: <b>{rial(mode.a.totals.totalRial)}</b>
              {mode.a.deltaRial !== null && <> (تغییر نسبت به نسخه قبل: {signed(mode.a.deltaRial)})</>}
            </div>
            <JalaliInput label="پیش‌بینی تحویل" value={forecast} onChange={setForecast} withTime />
            <span className="hint xs muted">مهلت رسمی از این‌جا تغییر نمی‌کند.</span>
            <label className="field">
              <span>توضیح</span>
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}

        {mode?.kind === 'authorize' && (
          <>
            <div className="callout callout-amber small">
              Manage فقط تصمیمی را ثبت می‌کند که در سامانه رسمی یا نزد مشتری گرفته شده است.
            </div>
            <div className="segmented" role="group" aria-label="تصمیم">
              {(['approved', 'partially_approved', 'rejected'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={decision === d} onClick={() => setDecision(d)}>
                  {DECISION_LABELS[d]}
                </button>
              ))}
            </div>
            <div className="grid-2">
              <label className="field">
                <span>مرجع تصمیم</span>
                <select className="input" value={source} onChange={(e) => setSource(e.target.value as AuthorizationSource)}>
                  {AUTHORIZATION_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {AUTHORIZATION_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>روش</span>
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value as AuthorizationMethod)}>
                  {AUTHORIZATION_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {AUTHORIZATION_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>شماره ثبت در سامانه رسمی{source !== 'customer' ? ' *' : ''}</span>
              <input className="input ltr-input" value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            <JalaliInput label="زمان تصمیم" value={at} onChange={setAt} withTime nowButton />
            {decision === 'partially_approved' && (
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <span>اقلام ردشده *</span>
                {mode.a.items.map((i) => (
                  <label key={i.id} className="check">
                    <input
                      type="checkbox"
                      checked={rejected.has(i.id)}
                      onChange={(e) => {
                        const next = new Set(rejected);
                        if (e.target.checked) next.add(i.id);
                        else next.delete(i.id);
                        setRejected(next);
                      }}
                    />
                    {toPersianDigits(i.lineNo)}. {i.description}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="field">
              <span>توضیح{decision !== 'approved' ? ' *' : ''}</span>
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}
      </Dialog>
    </section>
  );
}

function signed(n: number): string {
  if (n === 0) return 'بدون تغییر';
  return `${n > 0 ? 'افزایش' : 'کاهش'} ${rial(Math.abs(n))}`;
}
type DispatchSelection={lines:AssessmentDispatchLine[];selected:string[];onToggle:(id:string)=>void;onAll:(checked:boolean)=>void;onSend:()=>void;busy:boolean};

function Version({
  a,
  editable,
  manage,
  authorize,
  onItem,
  onRemove,
  onFinalize,
  onAuthorize,
  dispatch,
}: {
  a: Assessment;
  editable: boolean;
  manage: boolean;
  authorize: boolean;
  onItem?: (i: AssessmentItem | null) => void;
  onRemove?: (i: AssessmentItem) => void;
  onFinalize?: () => void;
  onAuthorize?: () => void;
  dispatch?: DispatchSelection;
}) {
  const draft = a.status === 'draft';
  const canEdit = draft && editable && manage;
  return (
    <div className="assessment" data-testid="assessment-version">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 6 }}>
          <b>
            نسخه {toPersianDigits(a.versionNo)} — {ASSESSMENT_KIND_LABELS[a.kind]}
          </b>
          {draft ? (
            <span className="chip">پیش‌نویس</span>
          ) : a.status === 'superseded' ? (
            <span className="chip">جایگزین‌شده</span>
          ) : null}
          {!draft && (
            <span className={`chip ${AUTH_TONE[a.authorizationStatus]}`}>
              {AUTHORIZATION_STATUS_LABELS[a.authorizationStatus]}
            </span>
          )}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {canEdit && (
            <>
              <button className="btn btn-sm" onClick={() => onItem?.(null)}>
                افزودن قلم
              </button>
              <button className="btn btn-sm btn-primary" disabled={!a.items.length} onClick={onFinalize}>
                نهایی کردن
              </button>
            </>
          )}
          {a.status === 'final' && a.authorizationStatus === 'pending' && editable && manage && (
            <button className="btn btn-sm btn-primary" onClick={onFinalize}>
              ثبت کارشناسی بدون انتظار مجوز
            </button>
          )}
        </div>
      </div>

      <div className="xs muted meta">
        <span>
          کارشناس: {a.assessorName}
          {a.assessorOrg ? ` (${a.assessorOrg})` : ''}
        </span>
        <span>کارشناسی: {formatJalali(a.assessedAt, { time: true })}</span>
        {a.discoveredAt && <span>کشف آسیب: {formatJalali(a.discoveredAt, { time: true })}</span>}
        {a.finalizedAt && (
          <span>
            نهایی: {formatJalali(a.finalizedAt, { time: true })} توسط {a.finalizedBy?.displayName}
          </span>
        )}
        {a.authorization && (
          <span>
            مجوز: {AUTHORIZATION_SOURCE_LABELS[a.authorization.source]}،{' '}
            {AUTHORIZATION_METHOD_LABELS[a.authorization.method]}
            {a.authorization.reference ? ` — شماره ${a.authorization.reference}` : ''}،{' '}
            {formatJalali(a.authorization.at, { time: true })}
            {a.authorization.note ? `؛ ${a.authorization.note}` : ''}
          </span>
        )}
      </div>
      {a.reason && <div className="small">{a.reason}</div>}
      {dispatch&&<div className="assessment-dispatch row" aria-label="ارسال اقلام کارشناسی"><label className="dispatch-select"><input type="checkbox" aria-label="انتخاب همه قطعات قابل ارسال" disabled={dispatch.busy||!dispatch.lines.some(l=>l.state==='ready')} checked={dispatch.lines.some(l=>l.state==='ready')&&dispatch.lines.filter(l=>l.state==='ready').every(l=>dispatch.selected.includes(l.itemId))} ref={el=>{if(el)el.indeterminate=dispatch.selected.length>0&&!dispatch.lines.filter(l=>l.state==='ready').every(l=>dispatch.selected.includes(l.itemId));}} onChange={e=>dispatch.onAll(e.target.checked)}/>انتخاب همه</label><button type="button" className="btn btn-primary" disabled={dispatch.busy||!dispatch.selected.length} onClick={dispatch.onSend}>{dispatch.busy?'در حال ارسال…':`ارسال به قطعات و تأمین (${faNum(dispatch.selected.length)})`}</button><span className="small muted">اقلام قبلی دوباره ارسال نمی‌شوند؛ افزایش تعداد فقط به اندازه مابه‌التفاوت ارسال می‌شود.</span></div>}

      {a.items.length > 0 && (
        <div className="table-scroll">
          <table className="table static items">
            <thead>
              <tr>
                {dispatch&&<th scope="col">انتخاب / ارسال</th>}
                <th>#</th>
                <th>شرح</th>
                <th className="num">تعداد</th>
                <th className="num">قطعه</th>
                <th className="num">اجرت</th>
                <th>وضعیت</th>
                {canEdit && <th aria-label="عملیات" />}
              </tr>
            </thead>
            <tbody>
              {a.items.map((i) => (
                <tr key={i.id} data-testid="assessment-item">
                  {dispatch&&<td>{dispatch.lines.find(l=>l.itemId===i.id)?.state==='ready'?<label className="dispatch-select"><input type="checkbox" aria-label={`انتخاب ${i.description}`} checked={dispatch.selected.includes(i.id)} disabled={dispatch.busy} onChange={()=>dispatch.onToggle(i.id)}/><span className="small">{faNum(dispatch.lines.find(l=>l.itemId===i.id)!.quantity)} عدد</span></label>:<span className="small">{dispatch.lines.find(l=>l.itemId===i.id)?.message}</span>}</td>}
                  <td className="num line">{toPersianDigits(i.lineNo)}</td>
                  <td className="desc">
                    <div>
                      <span className="chip">{ASSESSMENT_ITEM_ACTION_LABELS[i.action]}</span> {i.description}
                      {a.kind === 'supplement' && !i.originItemId && <span className="chip chip-blue">جدید</span>}
                      {a.kind === 'supplement' && i.originItemId && i.changed && (
                        <span className="chip chip-amber">تغییرکرده</span>
                      )}
                    </div>
                    <div className="xs muted">
                      {i.partNumber && <span className="ltr">{i.partNumber}</span>}
                      {i.action === 'replace' && i.partNumber && <StockFamilyPreview partNumber={i.partNumber} />}
                      {i.labourDepartment && ` · ${i.labourDepartment.name}`}
                      {i.evidence && <details className="compact-disclosure"><summary>منبع و مدرک</summary><p>{i.evidence}</p></details>}
                    </div>
                  </td>
                  <td className="num" data-label="تعداد">{faNum(i.quantity)}</td>
                  <td className="num" data-label="قطعه">{faNum(i.quantity * i.unitPriceRial)}</td>
                  <td className="num" data-label="اجرت">{faNum(i.labourRial)}</td>
                  <td className="status">
                    {!draft && (
                      <span
                        className={`chip ${i.approvalStatus === 'rejected' ? 'chip-red' : i.approvalStatus === 'approved' ? 'chip-green' : ''}`}
                      >
                        {a.authorizationStatus==='not_required'&&i.approvalStatus!=='rejected'?'ثبت‌شده':ITEM_APPROVAL_LABELS[i.approvalStatus]}
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="ops">
                      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => onItem?.(i)}>
                          ویرایش
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => onRemove?.(i)}>
                          حذف
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="totals small">
        <span>قطعات: {rial(a.totals.partsRial)}</span>
        <span>اجرت: {rial(a.totals.labourRial)}</span>
        <span>
          جمع کل: <b data-testid="assessment-total">{rial(a.totals.totalRial)}</b>
        </span>
        {a.deltaRial !== null && <span>نسبت به نسخه قبل: {signed(a.deltaRial)}</span>}
        {(a.authorizationStatus === 'partially_approved' || a.authorizationStatus === 'rejected') && (
          <span>
            مبلغ تأییدشده: <b>{rial(a.totals.approvedRial)}</b>
          </span>
        )}
      </div>
      {a.requiresFinancialReview && a.status === 'final' && (
        <div className="callout callout-amber small">
          هزینه این الحاقیه نسبت به نسخه قبل بیشتر است و پیش‌پرداخت یا تأیید مالی باید دوباره بررسی شود.
        </div>
      )}
    </div>
  );
}
