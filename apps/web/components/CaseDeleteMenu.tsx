'use client';
import { useState } from 'react';
import type { CaseListItem } from '@manage/shared';
import { api, errorMessage, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Dialog } from './Dialog';

/**
 * «حذف پرونده» for the owner only (owner, 2026-11-18): a discreet «⋯» beside the case.
 * The server checks the stored owner flag; this control is only hidden for others.
 * The case leaves active operations but stays recoverable in «پرونده‌های حذف‌شده».
 */
export function CaseDeleteMenu({ kase, onDone }: { kase: Pick<CaseListItem, 'id' | 'caseNumber' | 'admissionNo' | 'plate' | 'vehicleLabel'> & { vehicleSummary?: string }; onDone: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [key] = useState(newKey);
  if (!me.isOwner) return null;
  async function remove() {
    setBusy(true);
    setErr('');
    try {
      const detail = await api<{ version: number }>(`/cases/${kase.id}`);
      await api(`/cases/${kase.id}/delete`, { body: { expectedVersion: detail.version, reason: reason.trim(), confirm: true }, idempotencyKey: key });
      toast('پرونده حذف شد؛ از «پرونده‌های حذف‌شده» قابل بازیابی است');
      setOpen(false);
      onDone();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <details className="m-menu">
        <summary className="m-btn2-s" aria-label={`اقدام‌های مالک برای پروندهٔ ${kase.caseNumber}`}>⋯</summary>
        <div className="m-menu-pop" role="menu">
          <button type="button" role="menuitem" className="m-btn2-s warn" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setOpen(true); }}>حذف پرونده</button>
        </div>
      </details>
      <Dialog open={open} title="حذف پرونده" onClose={() => setOpen(false)} footer={<>
        <button type="button" className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={remove}>{busy ? 'در حال حذف…' : 'حذف پرونده'}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>انصراف</button>
      </>}>
        <dl className="m-dl">
          <dt>خودرو</dt><dd>{kase.vehicleSummary ?? kase.vehicleLabel}</dd>
          <dt>پلاک</dt><dd>{kase.plate ? toPersianDigits(kase.plate) : '—'}</dd>
          <dt>پرونده / پذیرش</dt><dd><bdi dir="ltr">{kase.caseNumber}</bdi>{kase.admissionNo ? <> · <bdi dir="ltr">{kase.admissionNo}</bdi></> : null}</dd>
        </dl>
        <p>این پرونده از فهرست‌ها، میزهای کار، جست‌وجو و آمار جاری بیرون می‌رود و رزروهای باز آن آزاد می‌شوند. هیچ داده‌ای پاک نمی‌شود و فقط مالک می‌تواند آن را بازیابی کند.</p>
        <label className="field">علت حذف *<input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً پروندهٔ آزمایشی" /></label>
        {err && <p className="m-error" role="alert">{err}</p>}
      </Dialog>
    </span>
  );
}
