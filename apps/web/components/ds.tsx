'use client';
// Manage design system — base components (slice S03, CORE-12 part 1; prompt Part B.2).
// Build once, reuse everywhere. All values come from app/ds-tokens.css; render inside `.ds`.
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { toPersianDigits } from '@manage/shared';
import { AppIcon, type IconName } from './AppIcon';

const fa = (v: string | number) => toPersianDigits(String(v));
export type DsStatus = 'good' | 'warn' | 'crit' | 'info' | 'none';
export type Coverage = 'gold' | 'ins' | 'own';
export const COVERAGE_LABEL: Record<Coverage, string> = { gold: 'کارت طلایی', ins: 'بیمه', own: 'شخصی' };

/** Iranian licence plate: «۱۲ ب ۳۴۵ - ۶۷». `masked` hides the middle digits (customer TV, guests). */
export function DsPlate({ a, letter, b, region, size = 'md', masked }: { a: string; letter: string; b: string; region: string; size?: 'sm' | 'md' | 'lg'; masked?: boolean }) {
  const mid = masked ? '•••' : fa(b);
  return (
    <span className={`ds-plate ${size === 'md' ? '' : size}${masked ? ' masked' : ''}`} dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'isolate' }} role="img" aria-label={`پلاک ${fa(a)} ${letter} ${masked ? 'پوشیده' : fa(b)} ایران ${fa(region)}`}>
      <span className="ds-plate-flag" aria-hidden><i /></span>
      <span className="ds-plate-main" aria-hidden><span>{fa(a)}</span><span>{letter}</span><span>{mid}</span></span>
      <span className="ds-plate-region" aria-hidden>{fa(region)}</span>
    </span>
  );
}

export interface VehicleCardData {
  name: string;
  plate: { a: string; letter: string; b: string; region: string };
  customer: string;
  stage: string;
  day: number;
  caseNo?: string;
  receptionNo?: string;
  status?: DsStatus;
  coverage?: Coverage;
  href?: string;
  extra?: ReactNode;
}

/** Vehicle card: short car name, plate, customer, stage, «روز n»; ids in fine type; status = edge strip. */
export function DsVehicleCard({ v, maskPlate }: { v: VehicleCardData; maskPlate?: boolean }) {
  const body = (
    <>
      <div className="ds-card-top">
        <span className="ds-card-name">{v.name}</span>
        <DsPlate {...v.plate} size="sm" masked={maskPlate} />
        {v.coverage && <span className={`ds-tag ${v.coverage}`}>{COVERAGE_LABEL[v.coverage]}</span>}
        <span className="ds-day ds-card-push">روز {fa(v.day)}</span>
      </div>
      <div className="ds-card-who"><span>{v.customer}</span><span className="ds-muted">· {v.stage}</span></div>
      {v.extra}
      {(v.caseNo || v.receptionNo) && <div className="ds-card-ids">{v.caseNo && <>پرونده {fa(v.caseNo)}</>}{v.caseNo && v.receptionNo && ' · '}{v.receptionNo && <>پذیرش {fa(v.receptionNo)}</>}</div>}
    </>
  );
  const cls = `ds-card s-${v.status ?? 'none'}`;
  return v.href ? <Link href={v.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Locked stepper: earlier stages done, the current one highlighted, later ones dimmed and locked. */
export function DsStepper({ steps, current, label = 'مراحل' }: { steps: string[]; current: number; label?: string }) {
  return (
    <ol className="ds-steps" aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'locked';
        return (
          <li key={s} className={`ds-step ${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <i aria-hidden>{state === 'done' ? '✓' : state === 'locked' ? <AppIcon name="lock" /> : fa(i + 1)}</i>{s}
          </li>
        );
      })}
    </ol>
  );
}

export interface DsColumn<T> { key: keyof T & string; label: string; render?: (row: T) => ReactNode; sortable?: boolean; numeric?: boolean }

/** Data table: sticky header, sort, filter, export buttons; collapses into cards under 640px. */
export function DsTable<T extends Record<string, unknown>>({ rows, columns, caption, onExport }: { rows: T[]; columns: DsColumn<T>[]; caption: string; onExport?: (kind: 'excel' | 'pdf') => void }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState('');
  const view = useMemo(() => {
    const needle = q.trim();
    let out = needle ? rows.filter((r) => columns.some((c) => String(r[c.key] ?? '').includes(needle))) : rows;
    if (sort) out = [...out].sort((x, y) => String(x[sort.key] ?? '').localeCompare(String(y[sort.key] ?? ''), 'fa', { numeric: true }) * sort.dir);
    return out;
  }, [rows, columns, q, sort]);
  return (
    <div>
      <div className="ds-table-tools">
        <input className="ds-input" placeholder="جست‌وجو در جدول" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`جست‌وجو در ${caption}`} />
        <div style={{ display: 'flex', gap: 'var(--ds-2)' }}>
          <button type="button" className="ds-btn ghost" onClick={() => onExport?.('excel')}><AppIcon name="download" />Excel</button>
          <button type="button" className="ds-btn ghost" onClick={() => onExport?.('pdf')}><AppIcon name="print" />PDF</button>
        </div>
      </div>
      <div className="ds-table-wrap">
        <table className="ds-table">
          <caption className="ds-muted ds-small" style={{ captionSide: 'bottom', padding: 'var(--ds-2)' }}>{caption} · {fa(view.length)} ردیف</caption>
          <thead><tr>{columns.map((c) => (
            <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
              {c.sortable === false ? c.label : <button type="button" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 1 ? -1 : 1 }))}>{c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button>}
            </th>
          ))}</tr></thead>
          <tbody>{view.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c.key} data-label={c.label} className={c.numeric ? 'ds-num' : undefined}>{c.render ? c.render(r) : fa(String(r[c.key] ?? '—'))}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

/** KPI card: number, comparison with the previous period, one line of explanation, link to the list behind it. */
export function DsKpi({ label, value, delta, goodWhenUp = true, note, href, xl }: { label: string; value: string | number; delta?: number; goodWhenUp?: boolean; note?: string; href?: string; xl?: boolean }) {
  const dir = delta === undefined || delta === 0 ? null : delta > 0 ? 'up' : 'down';
  const good = dir === null ? null : (dir === 'up') === goodWhenUp;
  const body = (
    <>
      <span className="ds-kpi-label">{label}</span>
      <span className="ds-kpi-value">{typeof value === 'number' ? fa(value) : value}</span>
      {dir && <span className={`ds-kpi-delta ${good ? 'up' : 'down'}`}>{dir === 'up' ? '▲' : '▼'} {fa(Math.abs(delta!))}٪ نسبت به دورهٔ قبل</span>}
      {note && <span className="ds-kpi-note">{note}</span>}
    </>
  );
  const cls = `ds-kpi${xl ? ' xl' : ''}`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** «آخرین به‌روزرسانی: ۱۰ دقیقه پیش» with a stale state when the source is behind. */
export function DsFreshness({ minutesAgo, staleAfter = 30, source = 'کسب‌وکار' }: { minutesAgo: number | null; staleAfter?: number; source?: string }) {
  if (minutesAgo === null) return <span className="ds-fresh stale">هنوز از {source} خوانده نشده</span>;
  const stale = minutesAgo > staleAfter;
  const ago = minutesAgo < 1 ? 'همین الان' : minutesAgo < 60 ? `${fa(minutesAgo)} دقیقه پیش` : `${fa(Math.round(minutesAgo / 60))} ساعت پیش`;
  return <span className={`ds-fresh${stale ? ' stale' : ''}`} role="status">آخرین به‌روزرسانی: {ago}{stale ? ` · ${source} عقب است` : ''}</span>;
}

/** تذکر: a short message from anyone to anyone, linked to a vehicle. */
export function DsReminder({ from, to, vehicle, text, when }: { from: string; to: string; vehicle: string; text: string; when: string }) {
  return (
    <div className="ds-reminder" role="note">
      <span className="ds-reminder-icon"><AppIcon name="bell" /></span>
      <span>{text}</span>
      <span className="ds-reminder-meta">{from} ← {to} · {vehicle} · {when}</span>
    </div>
  );
}

/** Empty, loading and error states, each with one guiding sentence. */
export function DsState({ kind, title, hint, action }: { kind: 'empty' | 'loading' | 'error'; title: string; hint: string; action?: { label: string; href: string } }) {
  if (kind === 'loading') return <div className="ds-state" role="status" aria-busy="true"><strong>{title}</strong><div className="ds-skel"><i /><i style={{ inlineSize: '80%' }} /><i style={{ inlineSize: '60%' }} /></div><span className="ds-small">{hint}</span></div>;
  const icon: IconName = kind === 'error' ? 'alert' : 'check';
  return (
    <div className={`ds-state ${kind === 'error' ? 'error' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      <AppIcon name={icon} />
      <strong>{title}</strong>
      <span className="ds-small">{hint}</span>
      {action && <Link className="ds-btn" href={action.href}>{action.label}</Link>}
    </div>
  );
}
