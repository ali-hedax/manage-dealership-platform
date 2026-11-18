'use client';

import { useEffect, useRef, useState } from 'react';
import type { Assessment, CaseDetail } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';

type Suggestion = {
  id: string;
  name: string;
  partNumber: string;
  vehicleUse: string;
  vehicleUseHint: boolean;
  requiresFitmentReview: boolean;
};
type Response = { results: Suggestion[]; limited: boolean; fitmentVerified: boolean };

/**
 * Case-scoped quick entry for insurance/private-pay assessments.
 * Uses existing versioned assessment mutation; no parallel parts table.
 * Free-text vehicleUse is a hint only, not certified fitment.
 */
export function SmartAssessmentEntry({
  kase, assessment, onSaved,
}: {
  kase: CaseDetail;
  assessment: Assessment;
  onSaved: () => Promise<Assessment[] | undefined>;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(assessment.version);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setVersion(assessment.version); }, [assessment.id, assessment.version]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]); setLoading(false); setOpen(false); return;
    }
    let cancelled = false;
    const abort = new AbortController();
    const handle = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        // api() has no AbortSignal parameter; ignore stale results on cleanup.
        const response = await api<Response>(`/cases/${kase.id}/assessment-catalog/search`, { body: { query: value } });
        if (!cancelled && !abort.signal.aborted) {
          setResults(response.results);
          setActive(0);
          setOpen(true);
        }
      } catch (e) {
        if (!cancelled) { setResults([]); setError(errorMessage(e)); setOpen(true); }
      } finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; abort.abort(); window.clearTimeout(handle); };
  }, [kase.id, query]);

  async function add(s: Suggestion) {
    if (busy) return;
    const duplicate = assessment.items.find(i => i.action === 'replace' && i.partNumber === s.partNumber);
    if (duplicate) {
      toast('این شماره فنی قبلاً در کارشناسی ثبت شده است؛ برای تغییر تعداد، همان قلم را ویرایش کنید.', 'error');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/assessments/${assessment.id}/items`, {
        body: {
          expectedVersion: version,
          action: 'replace',
          description: s.name,
          partNumber: s.partNumber,
          quantity,
          unitPriceRial: 0,
          labourRial: 0,
          labourDepartmentId: null,
          evidence: null,
        },
      });
      const updated = await onSaved();
      const fresh = updated?.find(a => a.id === assessment.id);
      if (fresh) setVersion(fresh.version);
      else setVersion(v => v + 1);
      setQuery(''); setResults([]); setOpen(false); setQuantity(1);
      toast('قطعه به پیش‌نویس کارشناسی اضافه شد');
      inputRef.current?.focus();
    } catch (e) {
      setError(errorMessage(e));
      // Version conflict must be refreshed and retried by user, never silently overwritten.
      await onSaved();
    } finally { setBusy(false); }
  }

  return <div className="panel-body stack" data-testid="smart-assessment-entry" dir="rtl">
    <div>
      <strong>ثبت سریع قطعات از کاتالوگ</strong>
      <p className="small muted">نام رایج قطعه یا شماره فنی را بنویسید، با کلیدهای جهت‌دار انتخاب کنید و Enter بزنید. پس از ثبت، قطعه بعدی را وارد کنید.</p>
    </div>
    <div className="grid-2">
      <label className="field">
        <span>جست‌وجوی قطعه</span>
        <input
          ref={inputRef}
          className="input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          aria-controls="smart-assessment-results"
          aria-activedescendant={open && results[active] ? `smart-part-${results[active].id}` : undefined}
          value={query}
          autoComplete="off"
          placeholder="مثلاً سپر، سپرجلو، شماره فنی…"
          disabled={busy}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          onKeyDown={e => {
            if (!open || !results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % results.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + results.length) % results.length); }
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
            if (e.key === 'Enter') { e.preventDefault(); void add(results[active]!); }
          }}
        />
      </label>
      <label className="field">
        <span>تعداد</span>
        <input className="input ltr-input" type="number" min={1} max={999} value={quantity} disabled={busy}
          onChange={e => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
      </label>
    </div>
    {loading && <p className="small muted" role="status">در حال جست‌وجوی کاتالوگ…</p>}
    {error && <p className="callout callout-red small" role="alert">{error}</p>}
    {open && !loading && <div id="smart-assessment-results" role="listbox" aria-label="قطعات پیشنهادی" style={{maxHeight:280,overflowY:'auto'}}>
      {results.length === 0 ? <p className="small muted">قطعه‌ای پیدا نشد. نام یا شماره فنی دیگری وارد کنید.</p> :
        results.map((s,i) => <div key={s.id} id={`smart-part-${s.id}`} role="option" aria-selected={i===active}
          style={{padding:8,borderBlockEnd:'1px solid var(--border, #ddd)',background:i===active?'var(--surface-2, transparent)':undefined}}>
          <div className="row" style={{justifyContent:'space-between',alignItems:'center',gap:8}}>
            <div><strong>{s.name}</strong> <bdi className="small">{s.partNumber}</bdi>
              {s.vehicleUse && <div className="xs muted">مصرف درج‌شده: {s.vehicleUse}</div>}
              <div className="xs muted">{s.vehicleUseHint?'نام مدل در اطلاعات مصرف قطعه دیده شد؛ سازگاری قطعی نیست':'سازگاری با خودرو باید بررسی شود'}</div>
            </div>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void add(s)}>افزودن</button>
          </div>
        </div>)}
    </div>}
    <p className="xs muted">انتخاب قطعه تأیید فنی یا مجوز خرید نیست. کدهای انتخابی باید توسط مسئول قطعات بررسی شوند. مبالغ را بعداً در فرم کارشناسی تکمیل کنید.</p>
  </div>;
}
