'use client';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { coverageTab, DESK_FILTER_LABELS, deskFilterMatch, toLatinDigits, type DeskFilter, type DeskFolder } from '@manage/shared';
import { fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, toPersianDigits } from '@/lib/format';
import { AppIcon } from './AppIcon';
import { BodyBadge, CoverageBadge, RowClip, VehicleImage } from './FolderParts';
import { Plate } from './Plate';
import { nextStepHelp } from './CaseFolderHeader';

// Accident desk in the approved design (owner, 2026-11-18; «Persian Accident Case
// Management Desk»): one row per case folder — the case-number slip with its narrow
// clip, the real plate, coverage and «تعویض اتاق», the short vehicle name and picture,
// «بیشتر ⋯» for rare actions and «پرونده» to open it. Same data and rules as the desks.

const STATUS_FILTERS: readonly DeskFilter[] = ['all', 'own', 'mine', 'parts', 'repair', 'delivery', 'behind'];
type Kind = 'all' | 'body' | 'other';
type Cover = 'all' | 'gold' | 'ins' | 'own';
const COVER_LABELS: Record<Cover, string> = { all: 'همه', gold: 'کارت طلایی', ins: 'بیمه بدنه', own: 'هزینه مشتری' };

export function AccidentDesk({ intro }: { intro?: ReactNode }) {
  const { me } = useAuth();
  const { data, error, mutate } = useSWR<DeskFolder[]>('/desk/folders', fetcher, { refreshInterval: 60_000 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DeskFilter>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [cover, setCover] = useState<Cover>('all');
  const [model, setModel] = useState('');
  const all = useMemo(() => data ?? [], [data]);
  const models = useMemo(() => [...new Set(all.map((f) => f.vehicle))].sort((a, b) => a.localeCompare(b, 'fa')), [all]);
  const term = toLatinDigits(q).trim().toLowerCase();
  const shown = all.filter((f) =>
    (!term || [f.plate, f.caseNumber, f.admissionNo, f.vehicle, f.vehicleFull, f.customerName].some((v) => v && toLatinDigits(v).toLowerCase().includes(term))) &&
    deskFilterMatch(f, status, ['accident_expert'], me.id) &&
    (kind === 'all' || (kind === 'body') === f.bodyReplacement) &&
    (cover === 'all' || coverageTab(f.coverageType).key === cover) &&
    (!model || f.vehicle === model),
  );
  const behind = all.filter((f) => f.behind).length;
  const waiting = all.filter((f) => deskFilterMatch(f, 'mine', ['accident_expert'], me.id)).length;

  return (
    <section className="adesk" aria-labelledby="adesk-title">
      <header className="adesk-head">
        <div className="adesk-title">
          <h1 id="adesk-title"><span className="adesk-ico" aria-hidden="true"><AppIcon name="car" /><AppIcon name="car" /></span>میز تصادفات</h1>
          <p>مدیریت پرونده‌های تصادف، بیمه و تعمیرات اساسی{data ? ` · ${faNum(all.length)} خودرو داخل تعمیرگاه` : ''}</p>
        </div>
        <div className="adesk-actions">{intro}</div>
      </header>

      <div className="adesk-filters" role="search">
        <label className="adesk-search">
          <span className="sr-only">جست‌وجوی پرونده، خودرو یا پلاک</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی پرونده، خودرو، پلاک …" />
          <AppIcon name="search" />
        </label>
        <label className="adesk-select"><span>وضعیت پرونده</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as DeskFilter)}>
            {STATUS_FILTERS.map((k) => <option key={k} value={k}>{DESK_FILTER_LABELS[k]} ({faNum(all.filter((f) => deskFilterMatch(f, k, ['accident_expert'], me.id)).length)})</option>)}
          </select>
        </label>
        <label className="adesk-select"><span>نوع پرونده</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="all">همه</option><option value="body">تعویض اتاق</option><option value="other">بدون تعویض اتاق</option>
          </select>
        </label>
        <label className="adesk-select"><span>پوشش</span>
          <select value={cover} onChange={(e) => setCover(e.target.value as Cover)}>
            {(Object.keys(COVER_LABELS) as Cover[]).map((k) => <option key={k} value={k}>{COVER_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="adesk-select"><span>مدل خودرو</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">همه</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      {data && (
        <p className="desk-strip" role="status">
          <AppIcon name="calendar" />
          <b>پیگیری‌های امروز:</b> {[waiting && `${faNum(waiting)} خودرو منتظر اقدام شماست`, behind && `${faNum(behind)} خودرو عقب‌تر از برنامه است`].filter(Boolean).join(' · ') || 'فعلاً چیزی منتظر شما نیست.'}
        </p>
      )}
      {error && <p role="alert" className="m-error">پرونده‌ها خوانده نشد. <button type="button" className="m-btn-s" onClick={() => void mutate()}>تلاش دوباره</button></p>}
      {!data && !error && <p className="m-empty" role="status">در حال خواندن پرونده‌ها…</p>}
      {data && !shown.length && <p className="m-empty">{all.length ? 'با این صافی پرونده‌ای نیست.' : 'هنوز خودرویی در تعمیرگاه ثبت نشده است.'}</p>}

      <ol className="arows" aria-label="پرونده‌های تصادفی">
        {shown.map((f) => <AccidentRow key={f.caseId} f={f} mine={!!me.id && f.responsibleUserId === me.id} />)}
      </ol>
    </section>
  );
}

function AccidentRow({ f, mine }: { f: DeskFolder; mine: boolean }) {
  const href = `/cases/${f.caseId}`;
  const step = nextStepHelp(f.next.text, f.next.actor);
  const actionHref = f.next.actor === 'none' ? href : `${href}#${step.anchor}`;
  return (
    <li className={`arow${f.behind ? ' behind' : ''}${mine ? ' mine' : ''}`} data-testid="accident-row" aria-label={`پروندهٔ ${f.vehicle}${f.plate ? `، پلاک ${toPersianDigits(f.plate)}` : ''}`}>
      <div className="arow-slip">
        <RowClip />
        <span className="arow-slip-k">پرونده شماره</span>
        <b><bdi>{toPersianDigits(f.caseNumber)}</bdi></b>
      </div>
      <div className="arow-plate"><Plate value={f.plate} size="row" /></div>
      <div className="arow-badges">
        <CoverageBadge coverage={f.coverageType} />
        {f.bodyReplacement && <BodyBadge />}
      </div>
      <div className="arow-car">
        <strong className="arow-name" title={f.vehicleFull}>{f.vehicle}</strong>
        <small className={`arow-next tone-${f.next.tone}`}><span>قدم بعدی:</span> {f.next.text}</small>
        <small className="arow-days">{faNum(f.daysInShop)} روز در تعمیرگاه{f.admissionNo ? <> · پذیرش <bdi>{toPersianDigits(f.admissionNo)}</bdi></> : null}{mine ? ' · پروندهٔ من' : ''}</small>
      </div>
      <VehicleImage vehicle={f.vehicle} size="md" />
      <div className="arow-end">
        <details className="more-menu">
          <summary className="arow-more" aria-label={`بیشتر — ${f.vehicle}`}>⋯</summary>
          <div className="more-pop" role="group" aria-label="اقدامات بیشتر">
            <Link href={href}><AppIcon name="folder" />نمای کلی پرونده</Link>
            <Link href={`${href}#case-parts`}><AppIcon name="box" />قطعات</Link>
            <Link href={`${href}#case-info`}><AppIcon name="doc" />مدارک</Link>
            <Link href={`${href}#case-history`}><AppIcon name="history" />تاریخچه</Link>
          </div>
        </details>
        <Link href={actionHref} className="arow-open" title={f.next.text} aria-label={`کارهای ضروری — ${f.vehicle}${f.plate ? ` با پلاک ${toPersianDigits(f.plate)}` : ''}`}><AppIcon name="folder" />کارهای ضروری</Link>
      </div>
    </li>
  );
}
