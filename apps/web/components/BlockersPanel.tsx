'use client';

import { useState } from 'react';
import { BLOCKER_REASONS, BLOCKER_REASON_LABELS, type Blocker, type BlockerReason, type CaseDetail } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { duration, formatJalali, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Dialog } from './Dialog';
import { JalaliInput } from './JalaliInput';

type Mode = { kind: 'new' } | { kind: 'follow'; b: Blocker } | { kind: 'resolve'; b: Blocker } | null;

export function BlockersPanel({ kase, onChange }: { kase: CaseDetail; onChange: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState<BlockerReason>('financial');
  const [note, setNote] = useState('');
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = kase.status === 'open';
  const tasks = new Map(kase.tasks.map((t) => [t.id, t]));
  const open = kase.blockers.filter((b) => !b.resolvedAt);
  const resolved = kase.blockers.filter((b) => b.resolvedAt);

  function start(m: NonNullable<Mode>) {
    setMode(m);
    setNote('');
    setAt(new Date().toISOString());
  }

  async function submit() {
    if (!mode) return;
    setBusy(true);
    try {
      if (mode.kind === 'new') {
        await api(`/cases/${kase.id}/blockers`, { body: { reason, description: note || null, occurredAt: at } });
        toast('مانع ثبت شد');
      } else if (mode.kind === 'follow') {
        await api(`/blockers/${mode.b.id}/follow-up`, { body: { note: note || null, at } });
        toast('پیگیری ثبت شد');
      } else {
        await api(`/blockers/${mode.b.id}/resolve`, { body: { note, at } });
        toast('رفع مانع ثبت شد');
      }
      setMode(null);
      onChange();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const row = (b: Blocker) => {
    const task = b.taskId ? tasks.get(b.taskId) : null;
    // Gap between occurrence and recording: late reporting, not the blocker itself.
    const lateMs = new Date(b.recordedAt).getTime() - new Date(b.occurredAt).getTime();
    return (
      <div key={b.id} className={`blocker${b.resolvedAt ? ' resolved' : ''}`}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 6 }}>
            <span className={`chip ${b.resolvedAt ? 'chip-green' : 'chip-red'}`}>{BLOCKER_REASON_LABELS[b.reason]}</span>
            <span className="small">{task ? task.department.name : 'کل پرونده'}</span>
          </div>
          {!b.resolvedAt && editable && can('blocker.manage') && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => start({ kind: 'follow', b })}>
                ثبت پیگیری
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => start({ kind: 'resolve', b })}>
                رفع مانع
              </button>
            </div>
          )}
        </div>
        {b.description && <div className="small" style={{ marginTop: 4 }}>{b.description}</div>}
        <div className="xs muted" style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
          <span>بروز: {formatJalali(b.occurredAt, { time: true })}</span>
          <span>
            ثبت: {formatJalali(b.recordedAt, { time: true })} توسط {b.recordedBy.displayName}
            {lateMs > 3_600_000 ? ` (${duration(b.occurredAt, b.recordedAt)} بعد از بروز)` : ''}
          </span>
          <span>
            پیگیری: {b.followUpCount ? `${toPersianDigits(b.followUpCount)} بار، آخرین ${formatJalali(b.lastFollowUpAt, { time: true })}` : 'ثبت نشده'}
          </span>
          {b.resolvedAt && (
            <span>
              رفع: {formatJalali(b.resolvedAt, { time: true })} توسط {b.resolvedBy?.displayName} پس از{' '}
              {duration(b.occurredAt, b.resolvedAt)}
              {b.resolutionNote ? `؛ ${b.resolutionNote}` : ''}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>موانع</h2>
        {editable && can('blocker.report') && (
          <button className="btn btn-sm" onClick={() => start({ kind: 'new' })}>
            ثبت مانع کل پرونده
          </button>
        )}
      </div>
      {kase.blockers.length === 0 && <div className="panel-body muted small">مانعی ثبت نشده است.</div>}
      {open.map(row)}
      {resolved.length > 0 && (
        <details>
          <summary className="panel-body small muted" style={{ cursor: 'pointer', paddingBlock: 10 }}>
            موانع رفع‌شده ({toPersianDigits(resolved.length)})
          </summary>
          {resolved.map(row)}
        </details>
      )}

      <Dialog
        open={!!mode}
        title={mode?.kind === 'new' ? 'ثبت مانع کل پرونده' : mode?.kind === 'follow' ? 'ثبت پیگیری مانع' : 'رفع مانع'}
        onClose={() => setMode(null)}
        footer={
          <>
            <button className="btn btn-primary" disabled={busy || (mode?.kind === 'resolve' && !note.trim())} onClick={submit}>
              {mode?.kind === 'new' ? 'ثبت مانع' : mode?.kind === 'follow' ? 'ثبت پیگیری' : 'ثبت رفع مانع'}
            </button>
            <button className="btn" onClick={() => setMode(null)}>
              انصراف
            </button>
          </>
        }
      >
        {mode?.kind === 'new' && (
          <label className="field">
            <span>علت مانع</span>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value as BlockerReason)}>
              {BLOCKER_REASONS.map((r) => (
                <option key={r} value={r}>
                  {BLOCKER_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        <JalaliInput
          label={mode?.kind === 'new' ? 'زمان بروز مانع' : mode?.kind === 'follow' ? 'زمان پیگیری' : 'زمان رفع'}
          value={at}
          onChange={setAt}
          withTime
          nowButton
        />
        <label className="field">
          <span>{mode?.kind === 'resolve' ? 'شرح رفع مانع *' : mode?.kind === 'follow' ? 'اقدام انجام‌شده' : 'توضیح'}</span>
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </Dialog>
    </section>
  );
}
