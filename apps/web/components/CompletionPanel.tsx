'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  QC_CHECK_ITEMS,
  QC_CHECK_LABELS,
  QC_OUTCOME_LABELS,
  QC_RESULT_LABELS,
  QC_SAFETY_ITEMS,
  RECIPIENT_RELATION_LABELS,
  RECIPIENT_RELATIONS,
  type CaseCompletion,
  type CaseDetail,
  type CaseFinance,
  type CloseState,
  type CompletionIssue,
  type Department,
  type QcCheckItem,
  type QcResult,
  type RecipientRelation,
} from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali, rial } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Dialog } from './Dialog';
import { JalaliInput } from './JalaliInput';

type Mode = 'qc' | 'technical' | 'financial' | 'delivery' | null;
interface CheckDraft {
  result: QcResult;
  note: string;
  departmentId: string;
}

const freshChecks = (): Record<QcCheckItem, CheckDraft> =>
  Object.fromEntries(QC_CHECK_ITEMS.map((i) => [i, { result: 'ok', note: '', departmentId: '' }])) as Record<
    QcCheckItem,
    CheckDraft
  >;

function IssueList({ issues }: { issues: CompletionIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="issues small">
      {issues.map((i) => (
        <li key={i.code} className={i.warning ? 'is-warning' : undefined}>
          {i.message}
          {i.count ? ` (${faNum(i.count)})` : ''}
          {i.amountRial ? `: ${rial(i.amountRial)}` : ''}
          {i.warning ? ' — هشدار، مانع بستن نیست' : ''}
        </li>
      ))}
    </ul>
  );
}

function CloseLine({ label, state }: { label: string; state: CloseState }) {
  const tone = state.valid ? 'chip-green' : state.closedAt ? 'chip-red' : 'chip-amber';
  const text = state.valid ? 'انجام شد' : state.closedAt ? 'نیاز به تکرار' : 'انجام نشده';
  return (
    <div className="row" style={{ gap: 6 }}>
      <b>{label}</b>
      <span className={`chip ${tone}`}>{text}</span>
      {state.closedAt && (
        <span className="xs muted">
          {state.closedBy?.displayName}، {formatJalali(state.closedAt, { time: true })}
          {state.note ? `؛ ${state.note}` : ''}
        </span>
      )}
    </div>
  );
}

/** QC rounds with corrective work, technical and financial close, and the vehicle handover. */
export function CompletionPanel({ kase, onChange }: { kase: CaseDetail; onChange: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: c, mutate } = useSWR<CaseCompletion>(`/cases/${kase.id}/completion`, fetcher);
  const { data: f } = useSWR<CaseFinance>(`/cases/${kase.id}/finance`, fetcher);
  const { data: departments } = useSWR<Department[]>(kase.status === 'open' ? '/departments' : null, fetcher);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState(freshChecks);
  const [note, setNote] = useState('');
  const [at, setAt] = useState<string | null>(null);
  const [waive, setWaive] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [relation, setRelation] = useState<RecipientRelation>('owner');
  const [confirmed, setConfirmed] = useState(false);

  const open = kase.status === 'open' && kase.stage !== 'delivered';
  if (!c) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>کنترل کیفیت و تحویل</h2>
        </div>
        <div className="panel-body muted small">در حال بارگذاری…</div>
      </section>
    );
  }

  const latest = c.qc.at(-1);
  const workDone = kase.tasks.every((t) => t.status === 'approved');
  const technicalBlocking = c.technical.issues.filter((i) => !i.warning);
  const balance = c.financial.issues.find((i) => i.code === 'balance_due');
  const financialOthers = c.financial.issues.filter((i) => !i.warning && i.code !== 'balance_due');

  function start(m: NonNullable<Mode>) {
    setMode(m);
    setNote('');
    setAt(new Date().toISOString());
    setWaive(false);
    if (m === 'qc') setChecks(freshChecks());
    if (m === 'delivery') {
      setRecipient(kase.customer?.fullName ?? '');
      setRelation('owner');
      setConfirmed(false);
    }
  }

  const setCheck = (item: QcCheckItem, patch: Partial<CheckDraft>) =>
    setChecks((prev) => ({ ...prev, [item]: { ...prev[item], ...patch } }));

  async function submit() {
    if (!mode) return;
    setBusy(true);
    try {
      const base = { expectedVersion: kase.version };
      if (mode === 'qc') {
        const res = await api<CaseCompletion>(`/cases/${kase.id}/qc`, {
          body: {
            ...base,
            at,
            note: note || null,
            checks: QC_CHECK_ITEMS.map((item) => {
              const d = checks[item];
              return {
                item,
                result: d.result,
                note: d.note || null,
                departmentId: d.result === 'fail' ? d.departmentId : null,
              };
            }),
          },
        });
        toast(
          res.qc.at(-1)?.outcome === 'passed'
            ? 'کنترل کیفیت قبول شد'
            : 'کنترل کیفیت رد شد؛ فعالیت اصلاحی ساخته شد و پرونده به تعمیر برگشت',
        );
      } else if (mode === 'technical') {
        await api(`/cases/${kase.id}/technical-close`, { body: { ...base, note: note || null } });
        toast('بستن فنی ثبت شد؛ خودرو آماده تحویل است');
      } else if (mode === 'financial') {
        await api(`/cases/${kase.id}/financial-close`, { body: { ...base, waiveBalance: waive, note: note || null } });
        toast('بستن مالی ثبت شد');
      } else {
        await api(`/cases/${kase.id}/delivery`, {
          body: { ...base, recipientName: recipient, recipientRelation: relation, handoverConfirmed: confirmed, at, note: note || null },
        });
        toast('تحویل خودرو ثبت شد؛ پرونده بایگانی شد');
      }
      setMode(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
      void mutate();
      onChange();
    }
  }

  const qcValid = QC_CHECK_ITEMS.every((i) => checks[i].result !== 'fail' || (!!checks[i].note.trim() && !!checks[i].departmentId));
  const canSubmit =
    mode === 'qc'
      ? qcValid
      : mode === 'financial'
        ? !waive || !!note.trim()
        : mode === 'delivery'
          ? recipient.trim().length >= 2 && confirmed
          : true;

  return (
    <section className="panel" data-testid="completion-panel">
      <div className="panel-head">
        <h2>کنترل کیفیت و تحویل</h2>
        {open && (
          <div className="row" style={{ gap: 6 }}>
            {can('qc.inspect') && (
              <button className="btn btn-sm" disabled={!workDone} onClick={() => start('qc')}>
                ثبت کنترل کیفیت
              </button>
            )}
            {can('case.technical_close') && !c.technical.valid && (
              <button className="btn btn-sm" disabled={technicalBlocking.length > 0} onClick={() => start('technical')}>
                بستن فنی
              </button>
            )}
            {can('finance.close') && !c.financial.valid && (
              <button
                className="btn btn-sm"
                disabled={financialOthers.length > 0 || (!!balance && !can('finance.approve') && !can('case.release_authorize'))}
                onClick={() => start('financial')}
              >
                بستن مالی
              </button>
            )}
            {can('case.deliver') && (
              <button className="btn btn-sm btn-primary" disabled={c.deliveryIssues.length > 0} onClick={() => start('delivery')}>
                تحویل خودرو
              </button>
            )}
          </div>
        )}
      </div>
      <div className="panel-body stack" style={{ gap: 12 }}>
        {c.delivery ? (
          <div className="callout callout-blue small" data-testid="delivery-done">
            تحویل به {c.delivery.recipientName} ({RECIPIENT_RELATION_LABELS[c.delivery.recipientRelation]})،{' '}
            {formatJalali(c.delivery.deliveredAt, { time: true })}، ثبت: {c.delivery.deliveredBy.displayName}
            {c.delivery.note ? `؛ ${c.delivery.note}` : ''}. پرونده بایگانی شده است.
          </div>
        ) : (
          !workDone &&
          can('qc.inspect') && <div className="xs muted">کنترل کیفیت پس از تأیید همه فعالیت‌ها توسط سرپرست ثبت می‌شود.</div>
        )}

        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 6 }}>
            <b>کنترل کیفیت</b>
            {latest ? (
              <span className={`chip ${latest.outcome === 'passed' ? 'chip-green' : 'chip-red'}`}>
                دور {faNum(latest.round)}: {QC_OUTCOME_LABELS[latest.outcome]}
              </span>
            ) : (
              <span className="chip chip-amber">ثبت نشده</span>
            )}
          </div>
          {c.qc
            .slice()
            .reverse()
            .map((q) => {
              const notable = q.checks.filter((x) => x.result !== 'ok');
              return (
                <div key={q.id} className="finance-item" data-testid="qc-round">
                  <div className="xs muted">
                    دور {faNum(q.round)}، {QC_OUTCOME_LABELS[q.outcome]} — {q.inspectedBy.displayName}،{' '}
                    {formatJalali(q.inspectedAt, { time: true })}
                    {q.note ? `؛ ${q.note}` : ''}
                  </div>
                  {notable.length > 0 && (
                    <ul className="issues small">
                      {notable.map((x) => (
                        <li key={x.item} className={x.result === 'na' ? 'is-warning' : undefined}>
                          {QC_CHECK_LABELS[x.item]}: {QC_RESULT_LABELS[x.result]}
                          {x.note ? ` — ${x.note}` : ''}
                          {x.correctiveTaskId ? ' (فعالیت اصلاحی ساخته شد)' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <CloseLine label="بستن فنی" state={c.technical} />
          {!c.delivery && !c.technical.valid && <IssueList issues={c.technical.issues} />}
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <CloseLine label="بستن مالی" state={c.financial} />
          {!!c.financial.waivedRial && (
            <span className="xs muted">مانده پذیرفته‌شده با تصمیم مدیر: {rial(c.financial.waivedRial)}</span>
          )}
          {!c.delivery && !c.financial.valid && <IssueList issues={c.financial.issues} />}
        </div>
      </div>

      <Dialog
        open={!!mode}
        title={
          mode === 'qc'
            ? `کنترل کیفیت — دور ${faNum((latest?.round ?? 0) + 1)}`
            : mode === 'technical'
              ? 'بستن فنی'
              : mode === 'financial'
                ? 'بستن مالی (تسویه)'
                : 'تحویل خودرو'
        }
        onClose={() => setMode(null)}
        footer={
          <>
            <button className="btn btn-primary" disabled={busy || !canSubmit} onClick={submit}>
              ثبت
            </button>
            <button className="btn" onClick={() => setMode(null)}>
              انصراف
            </button>
          </>
        }
      >
        {mode === 'qc' && (
          <>
            <div className="xs muted">
              برای هر مورد ردشده شرح ایراد و واحد انجام کار اصلاحی لازم است. موارد ایمنی (*) باید بازبینی شوند.
            </div>
            {QC_CHECK_ITEMS.map((item) => {
              const d = checks[item];
              const safety = QC_SAFETY_ITEMS.includes(item);
              return (
                <fieldset key={item} className="qc-check" data-testid={`qc-${item}`}>
                  <legend>
                    {QC_CHECK_LABELS[item]}
                    {safety ? ' *' : ''}
                  </legend>
                  <div className="segmented" role="group" aria-label={QC_CHECK_LABELS[item]}>
                    {(['ok', 'fail', 'na'] as const)
                      .filter((r) => r !== 'na' || !safety)
                      .map((r) => (
                        <button key={r} type="button" aria-pressed={d.result === r} onClick={() => setCheck(item, { result: r })}>
                          {QC_RESULT_LABELS[r]}
                        </button>
                      ))}
                  </div>
                  {d.result !== 'ok' && (
                    <input
                      className="input"
                      aria-label={`شرح — ${QC_CHECK_LABELS[item]}`}
                      placeholder={d.result === 'fail' ? 'شرح ایراد *' : 'توضیح'}
                      value={d.note}
                      onChange={(e) => setCheck(item, { note: e.target.value })}
                    />
                  )}
                  {d.result === 'fail' && (
                    <select
                      className="input"
                      aria-label={`واحد کار اصلاحی — ${QC_CHECK_LABELS[item]}`}
                      value={d.departmentId}
                      onChange={(e) => setCheck(item, { departmentId: e.target.value })}
                    >
                      <option value="">واحد کار اصلاحی *</option>
                      {departments?.map((dep) => (
                        <option key={dep.id} value={dep.id}>
                          {dep.name}
                        </option>
                      ))}
                    </select>
                  )}
                </fieldset>
              );
            })}
            <JalaliInput label="زمان کنترل" value={at} onChange={setAt} withTime nowButton />
            <label className="field">
              <span>توضیح</span>
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}
        {mode === 'technical' && (
          <>
            <div className="small">
              همه فعالیت‌ها تأیید شده، قطعات تحویل واحد شده و آخرین کنترل کیفیت قبول است. با بستن فنی پرونده «آماده تحویل»
              می‌شود.
            </div>
            <IssueList issues={c.technical.issues.filter((i) => i.warning)} />
            <label className="field">
              <span>توضیح</span>
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}
        {mode === 'financial' && (
          <>
            {f && (
              <dl className="dl">
                <dt>سهم مشتری</dt>
                <dd className="num">{f.customerShareRial === null ? '—' : rial(f.customerShareRial)}</dd>
                <dt>دریافت‌شده</dt>
                <dd className="num">{rial(f.paidRial)}</dd>
                <dt>مانده</dt>
                <dd className="num">{f.balanceRial === null ? '—' : rial(f.balanceRial)}</dd>
              </dl>
            )}
            {balance && (
              <label className="check">
                <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
                <span>بستن با مانده {rial(balance.amountRial ?? 0)} (تأیید مسئول مجاز خروج؛ دلیل الزامی)</span>
              </label>
            )}
            <label className="field">
              <span>{waive ? 'دلیل *' : 'توضیح'}</span>
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="xs muted">
              سهم بیمه یا کارت طلایی از سامانه رسمی تسویه می‌شود؛ Manage فقط سهم مشتری و دریافت‌ها را کنترل می‌کند.
            </div>
          </>
        )}
        {mode === 'delivery' && (
          <>
            <label className="field">
              <span>نام تحویل‌گیرنده *</span>
              <input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </label>
            <label className="field">
              <span>نسبت با مالک</span>
              <select className="input" value={relation} onChange={(e) => setRelation(e.target.value as RecipientRelation)}>
                {RECIPIENT_RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {RECIPIENT_RELATION_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <JalaliInput label="زمان تحویل" value={at} onChange={setAt} withTime nowButton />
            <label className="field">
              <span>توضیح</span>
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>تحویل‌گیرنده خودرو را بازدید کرد و برگه تحویل را امضا کرد *</span>
            </label>
          </>
        )}
      </Dialog>
    </section>
  );
}

