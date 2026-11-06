'use client';
import { useState } from 'react';
import useSWR from 'swr';
import type { CaseDetail, CaseWageRow, WageHistoryEntry } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali, parseAmount, rial } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Dialog } from './Dialog';

/**
 * "اجرت تعمیرکار" of each job: recorded by the accident coordinator, independent
 * from the assessment labour (one optional click copies the trade's share).
 * Each change needs a reason and stays in the history.
 */
export function CaseWagesPanel({ kase }: { kase: CaseDetail }) {
  const { can } = useAuth();
  const toast = useToast();
  const allowed = can('wage.manage') || can('wage.report');
  const { data, error, mutate } = useSWR<CaseWageRow[]>(allowed ? `/cases/${kase.id}/wages` : null, fetcher);
  const [editing, setEditing] = useState<CaseWageRow | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [historyOf, setHistoryOf] = useState<CaseWageRow | null>(null);
  const { data: history } = useSWR<WageHistoryEntry[]>(historyOf ? `/tasks/${historyOf.taskId}/wage-history` : null, fetcher);
  if (!allowed) return null;
  const manage = can('wage.manage');

  function edit(row: CaseWageRow) {
    setEditing(row);
    setAmount(row.wageRial === null ? '' : faNum(row.wageRial));
    setReason('');
    setFailure('');
  }
  async function save() {
    if (!editing || busy) return;
    const value = parseAmount(amount);
    if (!amount.trim()) return setFailure('مبلغ اجرت را وارد کنید.');
    if (editing.wageRial !== null && editing.wageRial !== value && !reason.trim()) return setFailure('برای تغییر اجرت، دلیل را بنویسید؛ در تاریخچه می‌ماند.');
    setBusy(true);
    setFailure('');
    try {
      await mutate(await api<CaseWageRow[]>(`/tasks/${editing.taskId}/wage`, { method: 'PUT', body: { amountRial: value, expectedVersion: editing.version, ...(reason.trim() ? { reason: reason.trim() } : {}) } }), { revalidate: false });
      toast('اجرت تعمیرکار ثبت شد');
      setEditing(null);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = (data ?? []).filter((r) => r.technician);
  return (
    <section className="panel case-wages" aria-label="اجرت تعمیرکار" data-testid="case-wages">
      <div className="panel-head">
        <div>
          <h2>اجرت تعمیرکار</h2>
          <p className="muted small">مستقل از اجرت کارشناسی است. فقط بعد از تأیید تحویل کار در کارکرد ماه تعمیرکار حساب می‌شود. تعمیرکار فقط مبلغ خودش را می‌بیند.</p>
        </div>
      </div>
      <div className="panel-body">
        {error && <p role="alert" className="callout callout-red">{errorMessage(error)}</p>}
        {data && !rows.length && <p className="muted small">هنوز کاری به حساب تعمیرکار ارجاع نشده است.</p>}
        {rows.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>کار</th><th>تعمیرکار</th><th>وضعیت</th><th>اجرت تعمیرکار</th><th>اجرت کارشناسی همان رشته</th><th>اقدام</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.taskId}>
                    <td data-label="کار">{r.title || r.departmentName}<div className="xs muted">{r.stationCode || r.departmentName}</div></td>
                    <td data-label="تعمیرکار">{r.technician?.displayName}</td>
                    <td data-label="وضعیت">{r.approvedAt ? <span className="chip chip-green">تأیید شد {formatJalali(r.approvedAt)}</span> : <span className="chip">هنوز تأیید نشده</span>}</td>
                    <td data-label="اجرت تعمیرکار">{r.wageRial === null ? <span className="missing">ثبت نشده</span> : <strong>{rial(r.wageRial)}</strong>}{r.reason && <div className="xs muted">دلیل آخرین تغییر: {r.reason}</div>}</td>
                    <td data-label="اجرت کارشناسی">{r.expertShareRial === null ? '—' : rial(r.expertShareRial)}</td>
                    <td data-label="اقدام" className="row">
                      {manage && <button type="button" className="btn btn-sm" onClick={() => edit(r)}>{r.wageRial === null ? 'ثبت اجرت' : 'ویرایش اجرت'}</button>}
                      {r.version > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHistoryOf(r)}>تاریخچه</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Dialog
        open={!!editing}
        title={`اجرت تعمیرکار — ${editing?.title || editing?.departmentName || ''}`}
        onClose={() => !busy && setEditing(null)}
        footer={<><button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>انصراف</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ثبت…' : 'ثبت اجرت'}</button></>}
      >
        <label className="field">
          <span>اجرت تعمیرکار (ریال)</span>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {editing?.expertShareRial !== null && editing?.expertShareRial !== undefined && (
          <button type="button" className="btn btn-sm" onClick={() => setAmount(faNum(editing.expertShareRial!))}>همان مبلغ کارشناسی ({rial(editing.expertShareRial)})</button>
        )}
        {editing?.wageRial !== null && (
          <label className="field">
            <span>دلیل تغییر *</span>
            <input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        {failure && <p role="alert" className="callout callout-red">{failure}</p>}
      </Dialog>
      <Dialog open={!!historyOf} title="تاریخچهٔ اجرت" onClose={() => setHistoryOf(null)} footer={<button type="button" className="btn" onClick={() => setHistoryOf(null)}>بستن</button>}>
        {!history && <p className="muted small">در حال دریافت…</p>}
        <ul className="reminder-list">
          {history?.map((h) => (
            <li key={h.at}>
              <strong>{rial(h.afterRial)}</strong>{h.beforeRial !== null && <span className="xs muted"> (قبلاً {rial(h.beforeRial)})</span>}
              <div className="xs muted">{formatJalali(h.at, { time: true })} · {h.actor ?? '—'}{h.reason ? ` · ${h.reason}` : ''}</div>
            </li>
          ))}
        </ul>
      </Dialog>
    </section>
  );
}
