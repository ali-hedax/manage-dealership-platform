'use client';

import { useEffect, useRef, useState } from 'react';
import { assessmentReference, normalizedPartCode, type Assessment, type AssessmentItem, type CaseDetail } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';

type Suggestion = {
  id: string;
  name: string;
  partNumber: string;
  reference: string | null;
  vehicleUse: string;
  common: boolean;
  /** «نیازمند بررسی تطابق با تیپ خودرو» for another trim of the family; null otherwise. */
  fitmentNote?: string | null;
};
type Response = { results: Suggestion[]; limited: boolean; fitmentVerified: boolean; family?: string; caseVehicle?: string | null; trimReview?: boolean; message?: string };

/** The line's assessment reference: the 8-digit code (or the whole code when it has no 8-digit start). */
const refOf = (code: string | null | undefined) => assessmentReference(code) ?? normalizedPartCode(code);

/**
 * Smart accident assessment, quick entry (owner, 2026-11-19). The catalog search returns
 * only parts verified for this case's vehicle family; a pick is saved with its 8-digit
 * reference as the line's code and the full catalog code beside it, so the parts clerk
 * can later choose the exact 10-digit OEM or longer market code. The bordered list below
 * shows every added part at once with quantity editing and removal.
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
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(assessment.version);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setVersion(assessment.version); }, [assessment.id, assessment.version]);
  const results = data?.results ?? [];
  const picked = assessment.items.filter((i) => i.action === 'replace');
  const pickedRefs = new Set(picked.map((i) => refOf(i.partNumber)));

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setData(null); setLoading(false); setOpen(false); return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await api<Response>(`/cases/${kase.id}/assessment-catalog/search`, { body: { query: value } });
        if (!cancelled) { setData(response); setActive(0); setOpen(true); }
      } catch (e) {
        if (!cancelled) { setData(null); setError(errorMessage(e)); setOpen(true); }
      } finally { if (!cancelled) setLoading(false); }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [kase.id, query]);

  async function refresh() {
    const updated = await onSaved();
    const fresh = updated?.find((a) => a.id === assessment.id);
    if (fresh) setVersion(fresh.version);
    else setVersion((v) => v + 1);
  }

  async function add(s: Suggestion) {
    if (busy) return;
    if (pickedRefs.has(refOf(s.partNumber))) {
      toast('این قطعه (همین کد ۸ رقمی) قبلاً اضافه شده است؛ تعداد همان ردیف را تغییر دهید.', 'error');
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
          partNumber: refOf(s.partNumber),
          sourcePartNumber: s.partNumber,
          quantity,
          unitPriceRial: 0,
          labourRial: 0,
          labourDepartmentId: null,
          evidence: null,
        },
      });
      await refresh();
      setJustAdded(refOf(s.partNumber));
      setQuery(''); setData(null); setOpen(false); setQuantity(1);
      inputRef.current?.focus();
    } catch (e) {
      setError(errorMessage(e));
      // A version conflict is refreshed and retried by the user, never silently overwritten.
      await onSaved();
    } finally { setBusy(false); }
  }

  async function changeQuantity(item: AssessmentItem, value: number) {
    const q = Math.max(1, Math.min(999, Math.round(value) || 1));
    if (q === item.quantity || busy) return;
    setBusy(true); setError('');
    try {
      await api(`/assessment-items/${item.id}`, { method: 'PATCH', body: { quantity: q, expectedVersion: version } });
      await refresh();
    } catch (e) { setError(errorMessage(e)); await onSaved(); } finally { setBusy(false); }
  }

  async function remove(item: AssessmentItem) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api(`/assessment-items/${item.id}/remove`, { body: { expectedVersion: version } });
      await refresh();
      toast(`«${item.description}» از کارشناسی حذف شد`);
    } catch (e) { setError(errorMessage(e)); await onSaved(); } finally { setBusy(false); }
  }

  return <div className="panel-body stack smart-entry" data-testid="smart-assessment-entry" dir="rtl">
    <div>
      <strong>ثبت سریع قطعات از کاتالوگ</strong>
      <p className="small muted">نام قطعه یا شماره فنی را بنویسید، با کلیدهای جهت‌دار انتخاب کنید و Enter بزنید. فقط قطعات سازگار با همین خودرو نشان داده می‌شوند.</p>
    </div>
    <div className="smart-search-row">
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
          placeholder="مثلاً سپر جلو، گلگیر، کاپوت، شماره فنی…"
          disabled={busy}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
            if (e.key === 'Enter') { e.preventDefault(); void add(results[active]!); }
          }}
        />
      </label>
      <label className="field smart-qty">
        <span>تعداد</span>
        <input className="input ltr-input" type="number" min={1} max={999} value={quantity} disabled={busy}
          onChange={(e) => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
      </label>
    </div>
    {data?.fitmentVerified && data.family && <dl className="smart-family xs" data-testid="smart-family">
      {data.caseVehicle && <div><dt>خودروی پرونده:</dt><dd>{data.caseVehicle}</dd></div>}
      <div><dt>خانوادهٔ شناسایی‌شده:</dt><dd>{data.family}</dd></div>
      <div><dt>نتایج:</dt><dd>قطعات مرتبط با خانوادهٔ {data.family}</dd></div>
    </dl>}
    {data?.fitmentVerified && data.trimReview && <p className="xs muted" data-testid="smart-trim-review">تیپ این خودرو در کاتالوگ جدا ثبت نشده است؛ پیش از ثبت، تطابق هر قطعه را با تیپ خودرو بررسی کنید.</p>}
    {loading && <p className="small muted" role="status">در حال جست‌وجوی کاتالوگ…</p>}
    {error && <p className="callout callout-red small" role="alert">{error}</p>}
    {open && !loading && data && !data.fitmentVerified && <p className="callout callout-amber small" role="alert" data-testid="smart-fitment-unverified">{data.message}</p>}
    {open && !loading && data?.fitmentVerified && <div id="smart-assessment-results" className="smart-results" role="listbox" aria-label="قطعات پیشنهادی">
      {results.length === 0 ? <p className="small muted">قطعهٔ سازگاری با این نام یا شماره پیدا نشد.</p> :
        results.map((s, i) => {
          const added = pickedRefs.has(refOf(s.partNumber));
          return <div key={s.id} id={`smart-part-${s.id}`} role="option" aria-selected={i === active} className={`smart-option${i === active ? ' on' : ''}`}
            onMouseEnter={() => setActive(i)}>
            <div className="smart-option-text">
              <strong>{s.name}</strong>
              <span className="smart-ref"><bdi dir="ltr">{toPersianDigits(refOf(s.partNumber))}</bdi></span>
              <span className="xs muted">کد کامل: <bdi dir="ltr">{s.partNumber}</bdi>{s.common ? ' · مشترک همهٔ خودروها' : ` · ${s.vehicleUse}`}</span>
              {s.fitmentNote && <span className="smart-fit-note" data-testid="smart-fit-note">{s.fitmentNote}</span>}
            </div>
            <button type="button" className="btn btn-sm" disabled={busy || added} onClick={() => void add(s)}>{added ? 'افزوده شد' : 'افزودن'}</button>
          </div>;
        })}
    </div>}

    <section className="smart-picked" aria-label="قطعات انتخاب‌شده" data-testid="smart-picked">
      <div className="smart-picked-head"><strong>قطعات انتخاب‌شده</strong><span className="smart-count">{toPersianDigits(String(picked.length))}</span></div>
      {picked.length === 0 ? <p className="small muted">هنوز قطعه‌ای اضافه نشده است.</p> : (
        <ul className="smart-picked-list">
          {picked.map((item) => (
            <li key={item.id} className={`smart-picked-row${justAdded && refOf(item.partNumber) === justAdded ? ' fresh' : ''}`} data-testid="smart-picked-row">
              <span className="smart-picked-name">{item.description}</span>
              <span className="smart-ref" title={item.sourcePartNumber ? `کد کامل: ${item.sourcePartNumber}` : undefined}><bdi dir="ltr">{toPersianDigits(item.partNumber ?? '—')}</bdi></span>
              <label className="smart-picked-qty">
                <span className="sr-only">تعداد {item.description}</span>
                <input className="input ltr-input" type="number" min={1} max={999} defaultValue={item.quantity} key={`${item.id}-${item.quantity}`} disabled={busy}
                  onBlur={(e) => void changeQuantity(item, Number(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void changeQuantity(item, Number((e.target as HTMLInputElement).value)); } }} />
              </label>
              <span className="smart-added">✓ افزوده شد</span>
              <button type="button" className="btn btn-sm smart-remove" disabled={busy} aria-label={`حذف ${item.description}`} onClick={() => void remove(item)}>حذف</button>
            </li>
          ))}
        </ul>
      )}
    </section>
    <p className="xs muted">کد ۸ رقمی مرجع کارشناسی است و کد کامل کاتالوگ کنار آن نگه داشته می‌شود؛ مسئول قطعات بعداً کد دقیق ۱۰ رقمی یا کد بازار را انتخاب می‌کند. انتخاب قطعه مجوز خرید نیست.</p>
  </div>;
}
