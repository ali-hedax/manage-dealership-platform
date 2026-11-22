'use client';

import { useEffect, useRef, useState } from 'react';
import { assessmentReference, normalizedPartCode, normalizeAssessmentSearch, type Assessment, type AssessmentItem, type AssessmentSearchScope, type CaseDetail, type PartCompatibility } from '@manage/shared';
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
  /** Catalog family of the part itself (its source vehicle); null for common or unlabelled parts. */
  vehicleFamily?: string | null;
  /** Judged against the CASE vehicle, whatever scope found the part. */
  compatibility?: PartCompatibility;
  /** Trim check, other vehicle or unknown applicability; null when verified. */
  fitmentNote?: string | null;
};
type Response = {
  results: Suggestion[]; limited: boolean; fitmentVerified: boolean; family?: string; caseVehicle?: string | null; trimReview?: boolean; message?: string;
  scope?: AssessmentSearchScope; scopeFamily?: { key: string; name: string } | null; offset?: number; total?: number; hasMore?: boolean;
};
type Family = { key: string; name: string; labels: string[]; parts: number; caseFamily: boolean };
type Vehicles = { caseVehicle: string | null; caseFamily: { key: string; name: string } | null; families: Family[] };

const SCOPES: { key: AssessmentSearchScope; label: string }[] = [
  { key: 'case', label: 'خودروی پرونده' },
  { key: 'vehicle', label: 'انتخاب خودرو' },
  { key: 'all', label: 'همه خودروها' },
];
/** Other states show their note (trim check, other vehicle, unknown applicability). */
const VERIFIED_LABEL = 'سازگار با خودروی پرونده';
/** Kept on the line for the technical reviewer when the pick is not verified for the case vehicle. */
const fitEvidence = (s: Suggestion) => (!s.compatibility || s.compatibility === 'verified' ? null
  : `منبع کاتالوگ: ${s.vehicleUse || 'بدون مصرف خودرو'}${s.vehicleFamily ? ` (خانوادهٔ ${s.vehicleFamily})` : ''} — ${s.fitmentNote ?? 'نیازمند بررسی فنی'}`);

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
  // Search scope only: the case's own vehicle is never changed here.
  const [scope, setScope] = useState<AssessmentSearchScope>('case');
  const [family, setFamily] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [vehicles, setVehicles] = useState<Vehicles | null>(null);
  const [more, setMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setVersion(assessment.version); }, [assessment.id, assessment.version]);
  const results = data?.results ?? [];
  const picked = assessment.items.filter((i) => i.action === 'replace');
  const pickedRefs = new Set(picked.map((i) => refOf(i.partNumber)));

  // The vehicle list is read once, when the picker is first needed.
  useEffect(() => {
    if (scope !== 'vehicle' || vehicles) return;
    let cancelled = false;
    api<Vehicles>(`/cases/${kase.id}/assessment-catalog/vehicles`)
      .then((v) => { if (!cancelled) setVehicles(v); })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [kase.id, scope, vehicles]);

  const body = (value: string, offset: number) => ({ query: value, scope, ...(scope === 'vehicle' ? { family } : {}), offset });

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2 || (scope === 'vehicle' && !family)) {
      setData(null); setLoading(false); setOpen(false); return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await api<Response>(`/cases/${kase.id}/assessment-catalog/search`, { body: body(value, 0) });
        if (!cancelled) { setData(response); setActive(0); setOpen(true); }
      } catch (e) {
        if (!cancelled) { setData(null); setError(errorMessage(e)); setOpen(true); }
      } finally { if (!cancelled) setLoading(false); }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [kase.id, query, scope, family]);

  /** The next page of a large result set, appended below the current one. */
  async function loadMore() {
    if (!data || more) return;
    setMore(true); setError('');
    try {
      const next = await api<Response>(`/cases/${kase.id}/assessment-catalog/search`, { body: body(query.trim(), data.results.length) });
      setData({ ...next, results: [...data.results, ...next.results.filter((r) => !data.results.some((x) => x.id === r.id))] });
    } catch (e) { setError(errorMessage(e)); } finally { setMore(false); }
  }

  const caseFamilyName = data?.fitmentVerified ? data.family : vehicles?.caseFamily?.name;
  const familyKey = normalizeAssessmentSearch(familyFilter);
  const shownFamilies = (vehicles?.families ?? []).filter((f) => !familyKey || f.key === family
    || [f.name, ...f.labels].some((x) => normalizeAssessmentSearch(x).includes(familyKey)));
  const chosen = vehicles?.families.find((f) => f.key === family);
  const scopeText = scope === 'case'
    ? (data?.fitmentVerified && data.family ? `قطعات مرتبط با خانوادهٔ ${data.family} (خودروی پرونده)` : 'قطعات خودروی پرونده')
    : scope === 'vehicle'
      ? (chosen ? `کاتالوگ ${chosen.name}${chosen.caseFamily ? ' (خانوادهٔ خودروی پرونده)' : ''}` : 'ابتدا خودرو را انتخاب کنید')
      : 'همهٔ خودروهای کاتالوگ';
  const crossScope = scope !== 'case' && !(scope === 'vehicle' && chosen?.caseFamily);

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
          // Source vehicle and the required technical check stay on the line when not verified.
          evidence: fitEvidence(s),
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
      <p className="small muted">نام قطعه یا شماره فنی را بنویسید، با کلیدهای جهت‌دار انتخاب کنید و Enter بزنید. به‌طور پیش‌فرض فقط قطعات سازگار با همین خودرو نشان داده می‌شوند.</p>
    </div>
    <div className="smart-scope" data-testid="smart-scope">
      <div className="segmented" role="group" aria-label="دامنهٔ جست‌وجوی خودرو">
        {SCOPES.map((s) => <button key={s.key} type="button" aria-pressed={scope === s.key} disabled={busy}
          onClick={() => { setScope(s.key); setData(null); setOpen(false); }}>{s.label}</button>)}
      </div>
      <dl className="smart-family xs" data-testid="smart-family">
        <div><dt>خودروی پرونده:</dt><dd>{data?.caseVehicle ?? vehicles?.caseVehicle ?? kase.vehicle?.model ?? '—'}</dd></div>
        {caseFamilyName && <div><dt>خانوادهٔ شناسایی‌شده:</dt><dd>{caseFamilyName}</dd></div>}
        <div><dt>دامنهٔ جست‌وجو:</dt><dd data-testid="smart-scope-text">{scopeText}</dd></div>
      </dl>
      {scope === 'vehicle' && <div className="smart-vehicle-pick">
        <label className="field">
          <span>جست‌وجوی خودرو</span>
          <input className="input" value={familyFilter} placeholder="مثلاً سمند، پژو 206…" autoComplete="off" disabled={busy}
            onChange={(e) => setFamilyFilter(e.target.value)} />
        </label>
        <label className="field">
          <span>خودروی کاتالوگ</span>
          <select className="input" value={family} disabled={busy || !vehicles} data-testid="smart-vehicle-select"
            onChange={(e) => { setFamily(e.target.value); setData(null); setOpen(false); }}>
            <option value="">{vehicles ? 'انتخاب خودرو…' : 'در حال خواندن فهرست…'}</option>
            {shownFamilies.map((f) => <option key={f.key} value={f.key}>
              {f.name}{f.caseFamily ? ' — خودروی پرونده' : ''} ({toPersianDigits(String(f.parts))} قطعه)
            </option>)}
          </select>
        </label>
      </div>}
      {crossScope && <p className="callout callout-amber small" data-testid="smart-cross-warning">قطعات خودروی دیگر ممکن است سازگار باشند، اما سازگاری آن‌ها با خودروی پرونده تأیید نشده است؛ هم‌پلتفرم بودن به معنای قابل‌تعویض بودن نیست. هر قلم انتخاب‌شده با منبع کاتالوگ برای بررسی فنی ثبت می‌شود.</p>}
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
    {scope === 'case' && data?.fitmentVerified && data.trimReview && <p className="xs muted" data-testid="smart-trim-review">تیپ این خودرو در کاتالوگ جدا ثبت نشده است؛ پیش از ثبت، تطابق هر قطعه را با تیپ خودرو بررسی کنید.</p>}
    {loading && <p className="small muted" role="status">در حال جست‌وجوی کاتالوگ…</p>}
    {error && <p className="callout callout-red small" role="alert">{error}</p>}
    {open && !loading && data && !data.fitmentVerified && data.message && <p className="callout callout-amber small" role="alert" data-testid="smart-fitment-unverified">{data.message} برای جست‌وجو در کاتالوگ خودروی دیگر «انتخاب خودرو» یا «همه خودروها» را بزنید.</p>}
    {open && !loading && data && (data.fitmentVerified || scope !== 'case') && <div id="smart-assessment-results" className="smart-results" role="listbox" aria-label="قطعات پیشنهادی">
      {results.length === 0 ? <p className="small muted">{scope === 'case' ? 'قطعهٔ سازگاری با این نام یا شماره پیدا نشد.' : 'قطعه‌ای با این نام یا شماره در این دامنه پیدا نشد.'}</p> :
        results.map((s, i) => {
          const added = pickedRefs.has(refOf(s.partNumber));
          return <div key={s.id} id={`smart-part-${s.id}`} role="option" aria-selected={i === active} className={`smart-option${i === active ? ' on' : ''}`}
            onMouseEnter={() => setActive(i)}>
            <div className="smart-option-text">
              <strong>{s.name}</strong>
              <span className="smart-ref"><bdi dir="ltr">{toPersianDigits(refOf(s.partNumber))}</bdi></span>
              <span className="xs muted" data-testid="smart-source">کد کامل: <bdi dir="ltr">{s.partNumber}</bdi>{s.common ? ' · مشترک همهٔ خودروها' : ` · خودروی کاتالوگ: ${s.vehicleFamily && s.vehicleFamily !== s.vehicleUse.trim() ? `${s.vehicleFamily} (${s.vehicleUse})` : s.vehicleUse || 'نامشخص'}`}</span>
              {s.compatibility === 'verified' && <span className="smart-fit-ok xs" data-testid="smart-compat">{VERIFIED_LABEL}</span>}
              {s.fitmentNote && <span className={`smart-fit-note${s.compatibility === 'other-family' || s.compatibility === 'unknown' ? ' cross' : ''}`} data-testid="smart-fit-note">{s.fitmentNote}</span>}
            </div>
            <button type="button" className="btn btn-sm" disabled={busy || added} onClick={() => void add(s)}>{added ? 'افزوده شد' : 'افزودن'}</button>
          </div>;
        })}
      {data.hasMore && <div className="smart-more">
        <span className="xs muted">{toPersianDigits(String(results.length))} از {toPersianDigits(String(data.total ?? results.length))} نتیجه</span>
        <button type="button" className="btn btn-sm" disabled={more || busy} onClick={() => void loadMore()} data-testid="smart-more">{more ? 'در حال خواندن…' : 'نتایج بیشتر'}</button>
      </div>}
      {data.limited && <p className="xs muted smart-more">نتایج این عبارت بیش از حد بررسی است؛ برای دیدن همهٔ قطعات مرتبط عبارت دقیق‌تر یا شماره فنی بنویسید.</p>}
    </div>}

    <section className="smart-picked" aria-label="قطعات انتخاب‌شده" data-testid="smart-picked">
      <div className="smart-picked-head"><strong>قطعات انتخاب‌شده</strong><span className="smart-count">{toPersianDigits(String(picked.length))}</span></div>
      {picked.length === 0 ? <p className="small muted">هنوز قطعه‌ای اضافه نشده است.</p> : (
        <ul className="smart-picked-list">
          {picked.map((item) => (
            <li key={item.id} className={`smart-picked-row${justAdded && refOf(item.partNumber) === justAdded ? ' fresh' : ''}`} data-testid="smart-picked-row">
              <span className="smart-picked-name">{item.description}{item.evidence?.startsWith('منبع کاتالوگ:') && <span className="smart-picked-note xs" data-testid="smart-picked-note">{item.evidence}</span>}</span>
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
