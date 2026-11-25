'use client';

import { useEffect, useRef, useState } from 'react';
import { assessmentReference, normalizedPartCode, partCodeKey, toLatinDigits, type AssessmentSearchScope, type Part } from '@manage/shared';
import { api, errorMessage, newKey } from '@/lib/api';
import { useCatalogSearch, type CatalogSuggestion } from '@/lib/catalog-search';
import { faNum, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';

/** The line's code: the 8-digit reference (as the assessment dispatch saves it), else the whole code. */
const refOf = (s: CatalogSuggestion) => s.reference ?? assessmentReference(s.partNumber) ?? normalizedPartCode(s.partNumber);
const digits = (code: string) => toLatinDigits(code).replace(/\D/g, '');
/** A 10-digit code is the procurement code; a longer or mixed one is shown as the full code. */
const fullCodeLabel = (code: string) => (digits(code).length === 10 && digits(code) === toLatinDigits(code).trim() ? 'کد تدارکاتی' : 'کد کامل');
const CLOSED = new Set(['cancelled', 'returned']);
const CURRENCY: Record<string, string> = { rial: 'ریال', toman: 'تومان' };

type Added = { key: string; name: string; code: string; quantity: number; merged: boolean };

/**
 * Intelligent manual «افزودن قطعه» for an existing vehicle case (owner, 2026-11-25). The same
 * engine, catalog, price list and fitment rules as the smart assessment (lib/catalog-search.ts);
 * the case vehicle is read on the server, never typed again. A pick is only a choice: adding goes
 * through POST /cases/:id/parts with its existing rules (same code → quantity raised while still
 * undecided, otherwise refused), and nothing is reserved, bought, delivered or approved here.
 */
export function SmartPartEntry({ caseId, parts, onAdded }: { caseId: string; parts: Part[]; onAdded: () => Promise<void> }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Extract<AssessmentSearchScope, 'case' | 'all'>>('case');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<CatalogSuggestion | null>(null);
  const [pickKey, setPickKey] = useState(newKey);
  const [qty, setQty] = useState('1');
  const [fitChecked, setFitChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recent, setRecent] = useState<Added[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const search = useCatalogSearch(`/cases/${caseId}/parts-catalog/search`, picked ? '' : query, scope, '', () => { setActive(0); setOpen(true); });
  const { data, loading } = search;
  const results = data?.results ?? [];

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => { if (picked) qtyRef.current?.select(); }, [picked]);

  const existingOf = (s: CatalogSuggestion) => {
    const key = partCodeKey(refOf(s));
    return key ? parts.find((p) => !CLOSED.has(p.flowState) && partCodeKey(p.partNumber) === key) : undefined;
  };
  const existing = picked ? existingOf(picked) : undefined;
  const blocked = !!existing && existing.flowState !== 'needed';
  const unverified = !!picked && picked.compatibility !== 'verified';
  const quantity = Math.max(1, Math.min(999, Number(toLatinDigits(qty)) || 1));

  function choose(s: CatalogSuggestion) {
    // Never chosen automatically: only a click or Enter on a highlighted row.
    setPicked(s); setPickKey(newKey()); setFitChecked(false); setOpen(false); setErr('');
  }
  function reset() {
    setPicked(null); setQuery(''); setQty('1'); setFitChecked(false); search.clear(); setOpen(false);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  async function add() {
    if (!picked || saving.current || blocked || (unverified && !fitChecked)) return;
    saving.current = true; setBusy(true); setErr('');
    const code = refOf(picked);
    const notes = [
      'انتخاب از جست‌وجوی هوشمند قطعات',
      picked.partNumber && normalizedPartCode(picked.partNumber) !== code ? `${fullCodeLabel(picked.partNumber)} کاتالوگ: ${picked.partNumber}` : null,
      unverified ? `سازگاری تأییدنشده: ${picked.vehicleUse || 'بدون مصرف خودرو'} — ${picked.fitmentNote ?? 'نیازمند بررسی فنی'}` : null,
    ].filter(Boolean).join(' — ');
    try {
      // The same key for this pick: a double press or a retried request never adds twice.
      await api(`/cases/${caseId}/parts`, { idempotencyKey: pickKey, body: { description: picked.name, partNumber: code, quantity, source: 'company', notes } });
      const merged = !!existing;
      toast(merged ? `تعداد «${picked.name}» در فهرست ${faNum(existing!.quantity + quantity)} شد` : `«${picked.name}» × ${faNum(quantity)} به فهرست اضافه شد`);
      setRecent((r) => [{ key: pickKey, name: picked.name, code, quantity, merged }, ...r].slice(0, 8));
      reset();
      await onAdded();
    } catch (e) {
      setErr(errorMessage(e));
    } finally { saving.current = false; setBusy(false); }
  }

  return <div className="m-form smart-entry smart-part-entry" style={{ flexBasis: '100%' }} data-testid="smart-part-entry" dir="rtl">
    <div className="smart-search-row" style={{ flexBasis: '100%' }}>
      <label className="m-field" style={{ flex: '1 1 260px' }}>جست‌وجوی قطعه (نام، بخشی از نام یا شماره فنی)
        <input ref={searchRef} role="combobox" aria-autocomplete="list" aria-expanded={open && results.length > 0} aria-controls="smart-part-results"
          aria-activedescendant={open && results[active] ? `smart-part-opt-${results[active].id}` : undefined}
          value={picked ? picked.name : query} autoComplete="off" disabled={busy} placeholder="مثلاً سپر، چراغ جلو، ۸ رقم شماره فنی…"
          data-testid="smart-part-search"
          onChange={(e) => { setPicked(null); setQuery(e.target.value); setOpen(false); setErr(''); }}
          onFocus={() => { if (!picked && results.length) setOpen(true); }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Escape') { e.preventDefault(); if (picked) reset(); else setOpen(false); return; }
            if (!open || !results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
            if (e.key === 'Enter') { e.preventDefault(); choose(results[active]!); }
          }} />
      </label>
      <div className="segmented" role="group" aria-label="دامنهٔ جست‌وجو">
        <button type="button" aria-pressed={scope === 'case'} disabled={busy} onClick={() => setScope('case')}>خودروی پرونده</button>
        <button type="button" aria-pressed={scope === 'all'} disabled={busy} onClick={() => setScope('all')}>همه خودروها</button>
      </div>
    </div>
    {data && <p className="xs muted" style={{ flexBasis: '100%', margin: 0 }} data-testid="smart-part-vehicle">
      خودروی پرونده: {data.caseVehicle ?? '—'}{data.fitmentVerified && data.family ? ` · خانوادهٔ ${data.family}` : ''}{scope === 'all' ? ' · جست‌وجو در همهٔ خودروها؛ سازگاری هر قطعه جدا نشان داده می‌شود' : ''}
    </p>}
    {loading && <p className="small muted" role="status" style={{ flexBasis: '100%', margin: 0 }}>در حال جست‌وجوی کاتالوگ…</p>}
    {search.error && <p className="m-error" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{search.error}</p>}
    {open && !picked && data && !data.fitmentVerified && data.message && scope === 'case' &&
      <p className="callout callout-amber small" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{data.message} برای قطعات خودروهای دیگر «همه خودروها» را بزنید.</p>}
    {open && !picked && data && <div id="smart-part-results" className="smart-results" role="listbox" aria-label="قطعات پیشنهادی" style={{ flexBasis: '100%' }}>
      {results.length === 0 ? <p className="small muted">قطعه‌ای با این نام یا شماره پیدا نشد. اگر در کاتالوگ نیست، «ثبت دستی» را بزنید.</p> :
        results.map((s, i) => {
          const dup = existingOf(s);
          return <div key={s.id} id={`smart-part-opt-${s.id}`} role="option" aria-selected={i === active} className={`smart-option${i === active ? ' on' : ''}`}
            onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)} data-testid="smart-part-option">
            <div className="smart-option-text">
              <strong>{s.name}</strong>
              <span className="smart-ref"><bdi dir="ltr">{toPersianDigits(refOf(s))}</bdi></span>
              <span className="row xs">
                {s.compatibility === 'verified'
                  ? <span className="smart-fit-ok">سازگار با خودروی پرونده</span>
                  : <span className="smart-fit-note cross">{s.fitmentNote ?? 'سازگاری تأیید نشده'}</span>}
                {s.availability === 'available' && <span className="chip chip-green">موجود · {toPersianDigits(s.available ?? '')}</span>}
                {s.availability === 'unavailable' && <span className="chip">ناموجود · ۰</span>}
                {dup && <span className="chip chip-amber">در فهرست · {faNum(dup.quantity)}</span>}
              </span>
            </div>
          </div>;
        })}
      {data.hasMore && <div className="smart-more"><span className="xs muted">{faNum(results.length)} از {faNum(data.total ?? results.length)} نتیجه</span>
        <button type="button" className="btn btn-sm" disabled={search.more || busy} onClick={() => void search.loadMore()}>{search.more ? 'در حال خواندن…' : 'نتایج بیشتر'}</button></div>}
    </div>}

    {picked && <section className="smart-pick-preview" aria-label="قطعهٔ انتخاب‌شده" data-testid="smart-part-preview" style={{ flexBasis: '100%' }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); reset(); } }}>
      <dl className="smart-family xs">
        <div><dt>نام قطعه:</dt><dd><strong>{picked.name}</strong></dd></div>
        <div><dt>شماره فنی:</dt><dd><bdi dir="ltr">{toPersianDigits(refOf(picked))}</bdi></dd></div>
        {picked.partNumber && normalizedPartCode(picked.partNumber) !== refOf(picked) && <div><dt>{fullCodeLabel(picked.partNumber)}:</dt><dd><bdi dir="ltr">{picked.partNumber}</bdi></dd></div>}
        <div><dt>خودرو و تیپ سازگار:</dt><dd>{picked.common ? 'مشترک همهٔ خودروها' : picked.vehicleFamily && picked.vehicleFamily !== picked.vehicleUse.trim() ? `${picked.vehicleFamily} (${picked.vehicleUse})` : picked.vehicleUse || 'نامشخص'}</dd></div>
        {picked.price && <div><dt>قیمت ثبت‌شده:</dt><dd>{faNum(Number(picked.price))} {picked.priceCurrency ? CURRENCY[picked.priceCurrency] ?? picked.priceCurrency : '(واحد پول تأییدنشده)'}</dd></div>}
        {picked.availability !== 'unknown' && picked.availability && <div><dt>موجودی انبار:</dt><dd>{picked.availability === 'available' ? toPersianDigits(picked.available ?? '') : '۰'}</dd></div>}
      </dl>
      {unverified && <label className="check small callout callout-amber" data-testid="smart-part-fit">
        <input type="checkbox" checked={fitChecked} onChange={(e) => setFitChecked(e.target.checked)} />
        {' '}سازگاری این قطعه با خودروی پرونده تأیید نشده است ({picked.fitmentNote ?? 'نیازمند بررسی فنی'}). با آگاهی انتخاب می‌کنم؛ برای بررسی فنی در یادداشت قلم ثبت می‌شود.
      </label>}
      {existing && !blocked && <p className="callout callout-blue small" style={{ margin: 0 }}>این قطعه با تعداد {faNum(existing.quantity)} در فهرست است؛ ردیف تازه ساخته نمی‌شود و تعداد همان ردیف {faNum(existing.quantity + quantity)} می‌شود.</p>}
      {blocked && <p className="m-error" role="alert" style={{ margin: 0 }}>این قطعه («{existing!.description}») در فهرست است و تأمین آن در جریان است؛ ردیف تکراری ساخته نمی‌شود.</p>}
      <div className="row" style={{ gap: 8, alignItems: 'end' }}>
        <label className="m-field" style={{ flex: '0 1 90px' }}>تعداد
          <input ref={qtyRef} inputMode="numeric" dir="ltr" value={qty} disabled={busy} data-testid="smart-part-qty" onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} />
        </label>
        <button type="button" className="m-btn-s" disabled={busy || blocked || (unverified && !fitChecked)} onClick={() => void add()} data-testid="smart-part-add">
          {busy ? 'در حال افزودن…' : existing && !blocked ? 'افزایش تعداد و ادامه' : 'افزودن و ادامه'}
        </button>
        <button type="button" className="m-btn2-s" disabled={busy} onClick={reset}>انتخاب دیگر</button>
      </div>
    </section>}
    {err && <p className="m-error" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{err}</p>}

    {recent.length > 0 && <section aria-label="قطعات افزوده‌شده در همین نوبت" className="smart-picked" style={{ flexBasis: '100%' }} data-testid="smart-part-recent">
      <div className="smart-picked-head"><strong>افزوده‌شده در همین نوبت</strong><span className="smart-count">{faNum(recent.length)}</span></div>
      <ul className="smart-picked-list">{recent.map((r) => <li key={r.key} className="smart-picked-row">
        <span className="smart-picked-name">{r.name}</span><span className="smart-ref"><bdi dir="ltr">{toPersianDigits(r.code)}</bdi></span>
        <span className="small">× {faNum(r.quantity)}</span><span className="smart-added">✓ {r.merged ? 'تعداد افزایش یافت' : 'افزوده شد'}</span>
      </li>)}</ul>
    </section>}
    <p className="xs muted" style={{ flexBasis: '100%', margin: 0 }}>انتخاب قطعه رزرو، خرید، تحویل یا تأیید نیست؛ قلم مثل «افزودن قطعه» عادی در فهرست ثبت می‌شود و مسئول قطعات کد دقیق ۱۰ رقمی را انتخاب می‌کند.</p>
  </div>;
}
