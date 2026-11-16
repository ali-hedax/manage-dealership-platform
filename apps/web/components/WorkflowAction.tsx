 'use client';
import { useState } from 'react';
import { CASE_STEPS, CASE_STEP_LABELS, type CaseDetail, type CaseWorkflow } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CaseTab } from './CaseFolderHeader';
export function WorkflowAction({ kase, workflow: w, tab, onTab, onChange }: { kase: CaseDetail; workflow: CaseWorkflow; tab: CaseTab; onTab: (t: CaseTab, anchor?: string) => void; onChange: () => void }) {
  const { can } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (kase.stage === 'delivered') return <p className="callout">خودرو تحویل شده است؛ پرونده در بایگانی نگهداری می‌شود.</p>;
  const next = tab === 'assessment' ? 'plan' : tab === 'plan' ? 'execution' : tab === 'execution' ? 'quality' : null;
  const requirements = next ? w.requirements[next] : [];
  async function confirm() {
    setBusy(true); setError('');
    try { await api(`/cases/${kase.id}/workflow`, { body: { action: 'confirm_plan', expectedVersion: kase.version } }); onChange(); onTab('execution'); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const future = next && CASE_STEPS.indexOf(next) > CASE_STEPS.indexOf(w.current);
  return <section className="cf-next" aria-label="قدم بعدی پرونده">
    <strong>مرحلهٔ جاری: {CASE_STEP_LABELS[w.current]}</strong>
    {!!requirements.length && <p>{requirements.join('؛ ')}</p>}
    {next && can('case.update') && <button type="button" className="m-btn" disabled={busy || !!requirements.length || (next === 'quality' && !!future)} onClick={() => tab === 'plan' ? void confirm() : onTab(next)}>{tab === 'plan' ? 'تأیید برنامه و شروع اجرا' : `رفتن به ${CASE_STEP_LABELS[next]}`} ←</button>}
    {tab !== w.current && !next && <button type="button" className="m-btn" onClick={() => onTab(w.current)}>ادامهٔ {CASE_STEP_LABELS[w.current]}</button>}
    {w.invoicePending && <p className="callout callout-red">جمع‌آوری فاکتورها با مسئول قطعات در انتظار تکمیل است.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
