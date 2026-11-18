'use client';
import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import type { DeletedCase } from '@manage/shared';
import { api, errorMessage, fetcher, newKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatJalali, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';

/** «پرونده‌های حذف‌شده»: owner only; search, deletion details and «بازیابی» (owner, 2026-11-18). */
export default function DeletedCasesPage() {
  const { me } = useAuth();
  const toast = useToast();
  const [term, setTerm] = useState(''), [q, setQ] = useState(''), [busy, setBusy] = useState<string | null>(null), [err, setErr] = useState('');
  const { data, error, mutate } = useSWR<DeletedCase[]>(me.isOwner ? `/deleted-cases${q ? `?q=${encodeURIComponent(q)}` : ''}` : null, fetcher);
  if (!me.isOwner) return <div className="callout"><h1>پرونده‌های حذف‌شده</h1><p>این بخش فقط برای مالک سامانه است.</p></div>;
  async function restore(c: DeletedCase) {
    setBusy(c.id);
    setErr('');
    try {
      await api(`/cases/${c.id}/restore`, { body: { expectedVersion: c.version }, idempotencyKey: newKey() });
      toast(`پروندهٔ ${c.caseNumber} بازیابی شد`);
      await mutate();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(null);
    }
  }
  const search = (e: FormEvent) => { e.preventDefault(); setQ(term.trim()); };
  return (
    <div className="stack">
      <header className="unit-header"><div><h1>پرونده‌های حذف‌شده</h1><p className="muted">این پرونده‌ها از کار جاری بیرون‌اند ولی هیچ داده‌ای از آن‌ها پاک نشده است. بازیابی هیچ رزرو یا حرکت موجودی تازه‌ای نمی‌سازد؛ قطعات رزروشدهٔ قبلی دوباره تعیین تکلیف می‌شوند.</p></div></header>
      <form className="workspace-search" onSubmit={search}><label className="field">جست‌وجو<input className="input" value={term} maxLength={100} onChange={(e) => setTerm(e.target.value)} placeholder="شماره پرونده، پذیرش، پلاک یا شاسی" /></label><button type="submit" className="btn">جست‌وجو</button></form>
      {(error || err) && <p className="callout callout-red" role="alert">{err || 'دریافت فهرست ناموفق بود.'}</p>}
      <div className="panel table-scroll">
        <table className="table">
          <thead><tr><th>پرونده و پذیرش</th><th>خودرو</th><th>پلاک</th><th>حذف</th><th>علت</th><th /></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id}>
                <td><bdi dir="ltr">{c.caseNumber}</bdi>{c.admissionNo && <div className="small">پذیرش: <bdi dir="ltr">{c.admissionNo}</bdi></div>}</td>
                <td>{c.vehicle}</td>
                <td>{c.plate ? toPersianDigits(c.plate) : '—'}</td>
                <td>{formatJalali(c.deletedAt, { time: true })}<div className="small muted">{c.deletedBy?.displayName}</div></td>
                <td>{c.reason ?? '—'}</td>
                <td><button type="button" className="btn btn-sm" disabled={busy === c.id} onClick={() => void restore(c)}>{busy === c.id ? 'در حال بازیابی…' : 'بازیابی'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.length && <p className="panel-body muted">پروندهٔ حذف‌شده‌ای نیست.</p>}
      </div>
    </div>
  );
}
