'use client';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import type { AdminActions, SystemAdminAccount } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatJalali, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';

/**
 * Owner only: the boundary with the system administrator. One clear switch for
 * "invite and deactivate staff" per administrator, and the report of every
 * system-admin action with its reason (read from the audit trail).
 */
export function OwnerAdminControls() {
  const { me } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState('');
  const { data, error, mutate } = useSWR<AdminActions>(me.isOwner ? `/access/admin-actions${month ? `?month=${month}` : ''}` : null, fetcher);
  const [busy, setBusy] = useState('');
  if (!me.isOwner) return null;

  async function toggle(a: SystemAdminAccount) {
    if (busy) return;
    setBusy(a.id);
    try {
      await api<SystemAdminAccount[]>(`/access/users/${a.id}/staff-admin`, { method: 'PUT', body: { granted: !a.canManageStaff, expectedVersion: a.version } });
      toast(a.canManageStaff ? `دسترسی دعوت و غیرفعال کردن کارکنان از ${a.displayName} گرفته شد` : `دسترسی دعوت و غیرفعال کردن کارکنان به ${a.displayName} داده شد`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy('');
      void mutate();
    }
  }

  return (
    <section id="owner-admin" className="card owner-admin" aria-labelledby="owner-admin-title" data-testid="owner-admin">
      <h2 id="owner-admin-title">اختیارات مدیر سیستم</h2>
      <p className="muted small">آیا مدیر سیستم بتواند کارکنان و تعمیرکارها را اضافه یا غیرفعال کند؟</p>
      {error && <p role="alert" className="callout callout-red">{errorMessage(error)}</p>}
      {!data && !error && <p role="status" className="muted">در حال دریافت…</p>}
      {data && !data.admins.length && <p className="muted">حساب مدیر سیستم دیگری در این نمایندگی نیست.</p>}
      <ul className="owner-admin-list">
        {data?.admins.map((a) => (
          <li key={a.id}>
            <div>
              <strong>{a.displayName}</strong>
              <span className="xs muted">{a.isActive ? 'فعال' : 'غیرفعال'}</span>
            </div>
            <label className="switch">
              <input type="checkbox" role="switch" checked={a.canManageStaff} disabled={busy === a.id} onChange={() => void toggle(a)} aria-label={`دعوت و غیرفعال کردن کارکنان؛ ${a.displayName}`} />
              <span>{a.canManageStaff ? 'می‌تواند دعوت و غیرفعال کند' : 'نمی‌تواند دعوت و غیرفعال کند'}</span>
            </label>
          </li>
        ))}
      </ul>

      <details className="owner-admin-report">
        <summary>گزارش اقدامات مدیر سیستم</summary>
        <p className="muted small">هر باز کردن محدودیت یا اصلاح ثبت توسط مدیر سیستم با دلیلش اینجا دیده می‌شود.</p>
        <div className="row">
          <label className="field">
            <span className="sr-only">ماه</span>
            <select className="input" value={month || data?.month || ''} onChange={(e) => setMonth(e.target.value)} aria-label="ماه گزارش اقدامات">
              {(data?.months ?? []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
        </div>
        {data && !data.rows.length && <p className="muted small">در {data.label} اقدامی از مدیر سیستم ثبت نشده است.</p>}
        {data && data.rows.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>زمان</th><th>مدیر سیستم</th><th>اقدام</th><th>پرونده</th><th>دلیل</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="زمان">{formatJalali(r.occurredAt, { time: true })}</td>
                    <td data-label="مدیر سیستم">{r.actor.displayName}</td>
                    <td data-label="اقدام">{r.actionLabel}</td>
                    <td data-label="پرونده">{r.caseId && r.caseNumber ? <Link href={`/cases/${r.caseId}`}><bdi>{toPersianDigits(r.caseNumber)}</bdi></Link> : '—'}</td>
                    <td data-label="دلیل">{r.reason ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </section>
  );
}
