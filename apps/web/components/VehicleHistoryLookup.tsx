'use client';

import { useRef, useState } from 'react';
import type { CaseDetail, CaseListItem, Paged } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { formatJalali, toPersianDigits } from '@/lib/format';

export function VehicleHistoryLookup({ onSelect }: { onSelect: (source: CaseDetail) => void }) {
  const [query, setQuery] = useState(''), [items, setItems] = useState<CaseListItem[]>([]);
  const [busy, setBusy] = useState(false), [searched, setSearched] = useState(false), [error, setError] = useState('');
  const request = useRef(0);
  async function search() {
    const token = ++request.current;
    setBusy(true); setError(''); setItems([]); setSearched(false);
    try {
      const result = await api<Paged<CaseListItem>>(`/cases?${new URLSearchParams({ vehicleIdentity: query.trim(), status: 'all', pageSize: '5' })}`);
      if (token === request.current) { setItems(result.items); setSearched(true); }
    } catch (e) { if (token === request.current) setError(errorMessage(e)); }
    finally { if (token === request.current) setBusy(false); }
  }
  async function select(id: string) {
    const token = ++request.current; setBusy(true); setError('');
    try { const source = await api<CaseDetail>(`/cases/${id}`); if (token === request.current) onSelect(source); }
    catch (e) { if (token === request.current) setError(errorMessage(e)); }
    finally { if (token === request.current) setBusy(false); }
  }
  return <div className="stack" data-testid="vehicle-history-lookup">
    <label className="field"><span>VIN کامل یا شماره شاسی عین سابقه</span><input className="input" maxLength={32} value={query} onChange={e => { ++request.current; setQuery(e.target.value); setItems([]); setSearched(false); setBusy(false); setError(''); }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (query.trim().length >= 6) void search(); } }} /></label>
    <div><button type="button" className="btn" disabled={busy || query.trim().length < 6} onClick={() => void search()}>{busy ? 'در حال بررسی…' : 'جست‌وجوی پذیرش‌های قبلی خودرو'}</button></div>
    {error && <p role="alert" className="callout callout-red">{error}</p>}
    {searched && !items.length && <p role="status" className="small muted">پذیرشی با همین شماره شاسی پیدا نشد؛ اطلاعات را دستی یا از اطلاعات پایه وارد کنید.</p>}
    {items.map((item, i) => <div className="history-choice" key={item.id}><div><strong>{item.vehicleLabel}</strong><p className="small muted">{i === 0 ? 'آخرین پذیرش' : 'پذیرش قبلی'}: <bdi>{toPersianDigits(item.caseNumber)}</bdi> · {formatJalali(item.admittedAt)}</p></div><button type="button" className="btn btn-sm" disabled={busy} onClick={() => void select(item.id)}>استفاده از مشخصات خودرو و مشتری</button></div>)}
  </div>;
}
