'use client';

import { useEffect, useRef, useState } from 'react';
import type { AssessmentSearchScope, PartCompatibility } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';

/** One result of the shared intelligent parts search (catalog, price list and warehouse). */
export type CatalogSuggestion = {
  id: string;
  name: string;
  /** Full catalog / warehouse code (a 10-digit procurement code or a longer market code). */
  partNumber: string;
  /** 8-digit assessment reference, when the code has one. */
  reference: string | null;
  vehicleUse: string;
  common: boolean;
  /** Catalog family of the part itself (its source vehicle); null for common or unlabelled parts. */
  vehicleFamily?: string | null;
  /** Judged against the CASE vehicle, whatever scope found the part. */
  compatibility?: PartCompatibility;
  /** Trim check, other vehicle or unknown applicability; null when verified. */
  fitmentNote?: string | null;
  available?: string | null;
  availability?: 'available' | 'unavailable' | 'unknown';
  source?: 'catalog' | 'warehouse' | 'both';
  /** Sale price of the active stock report, when it has one. */
  price?: string | null;
  priceCurrency?: string | null;
};
export type CatalogResponse = {
  results: CatalogSuggestion[]; limited: boolean; fitmentVerified: boolean; family?: string; caseVehicle?: string | null; trimReview?: boolean; message?: string;
  scope?: AssessmentSearchScope; scopeFamily?: { key: string; name: string } | null; offset?: number; total?: number; hasMore?: boolean;
};

/**
 * Debounced search against one of the case-scoped endpoints of the same engine
 * (`/cases/:id/assessment-catalog/search` for the assessment, `/cases/:id/parts-catalog/search`
 * for the manual «افزودن قطعه»). Results of an older query are never shown: each change of the
 * query, scope or vehicle starts a new generation and earlier answers are dropped.
 */
export function useCatalogSearch(endpoint: string, query: string, scope: AssessmentSearchScope, family: string, onResults?: () => void) {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const generation = useRef(0);
  const shown = useRef(onResults);
  shown.current = onResults;
  const body = (value: string, offset: number) => ({ query: value, scope, ...(scope === 'vehicle' ? { family } : {}), offset });

  useEffect(() => {
    const mine = ++generation.current;
    const value = query.trim();
    setData(null);
    if (value.length < 2 || (scope === 'vehicle' && !family)) { setLoading(false); setError(''); return; }
    const handle = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await api<CatalogResponse>(endpoint, { body: body(value, 0) });
        if (mine === generation.current) { setData(response); shown.current?.(); }
      } catch (e) {
        if (mine === generation.current) { setData(null); setError(errorMessage(e)); shown.current?.(); }
      } finally { if (mine === generation.current) setLoading(false); }
    }, 200);
    return () => { window.clearTimeout(handle); };
  }, [endpoint, query, scope, family]);

  /** The next page of a large result set, appended below the current one. */
  async function loadMore() {
    if (!data || more) return;
    const mine = generation.current;
    setMore(true); setError('');
    try {
      const next = await api<CatalogResponse>(endpoint, { body: body(query.trim(), data.results.length) });
      if (mine !== generation.current) return;
      setData({ ...next, results: [...data.results, ...next.results.filter((r) => !data.results.some((x) => x.id === r.id))] });
    } catch (e) { setError(errorMessage(e)); } finally { setMore(false); }
  }

  /** Forget the shown results (after a pick); a new keystroke searches again. */
  function clear() { generation.current += 1; setData(null); setLoading(false); }

  return { data, loading, error, more, loadMore, clear };
}
