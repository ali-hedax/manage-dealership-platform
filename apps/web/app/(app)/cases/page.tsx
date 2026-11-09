'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  CASE_STAGES,
  COVERAGE_LABELS,
  COVERAGE_TYPES,
  MISSING_FIELD_LABELS,
  STAGE_LABELS,
  type CaseListItem,
  type Paged,
} from '@manage/shared';
import { CoverageChip, StageChip } from '@/components/Chips';
import { VehicleDisclosure } from '@/components/VehicleDisclosure';
import { Plate } from '@/components/Plate';
import { fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deadlineTone, faNum, formatJalali, relativeDays, toPersianDigits } from '@/lib/format';

const FLAGS: { key: string; label: string }[] = [
  { key: 'overdue', label: 'مهلت گذشته' },
  { key: 'due_soon', label: 'تحویل نزدیک' },
  { key: 'blocked', label: 'دارای مانع' },
  { key: 'unassigned', label: 'بدون مسئول' },
  { key: 'needs_completion', label: 'نیازمند تکمیل' },
  { key: 'ready', label: 'آماده تحویل' },
  { key: 'legacy', label: 'ثبت از قبل' },
  { key: 'awaiting_authorization', label: 'منتظر تأیید قیمت بازار' },
  { key: 'parts_to_order', label: 'قطعه سفارش‌نشده' },
  { key: 'parts_overdue', label: 'قطعه دیرکرد' },
  { key: 'finance_pending', label: 'منتظر تصمیم مالی' },
  { key: 'overdue_official', label: 'عبور از مهلت رسمی' },
  { key: 'overdue_forecast', label: 'عبور از پیش‌بینی' },
  { key: 'no_deadline', label: 'بدون موعد' },
];

function CasesList() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAuth();
  const [q, setQ] = useState(params.get('q') ?? '');

  // Debounced search keeps the URL shareable and the back button meaningful.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== q) update({ q: q || null, page: null });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`/cases${next.toString() ? `?${next}` : ''}`);
  }

  const apiQuery = new URLSearchParams(params.toString());
  const { data, error, isLoading } = useSWR<Paged<CaseListItem>>(`/cases?${apiQuery}`, fetcher, {
    keepPreviousData: true,
  });
  const flag = params.get('flag');
  const page = Number(params.get('page') ?? 1);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>پرونده‌های تصادفی</h1>
          <p className="muted small">{data ? `${faNum(data.total)} پرونده` : ' '}</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {can('case.update') && (
            <Link className="btn" href="/reports?view=accident">
              گزارش تصادفات
            </Link>
          )}
          {can('case.import') && (
            <Link className="btn" href="/cases/import">
              ورود خودروهای موجود از اکسل
            </Link>
          )}
          {can('case.create') && (
            <Link className="btn btn-primary" href="/cases/new">
              ثبت پرونده
            </Link>
          )}
        </div>
      </div>

      {params.get('stationCode')&&<p className="callout">پرونده‌های دارای ارجاع به جایگاه <bdi>{params.get('stationCode')}</bdi> <button type="button" className="btn btn-sm" onClick={()=>update({stationCode:null,page:null})}>برداشتن فیلتر جایگاه</button></p>}
      <div className="panel">
        <div className="panel-body stack" style={{ gap: 12 }}>
          <input
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جست‌وجو با پلاک، VIN، شاسی، شماره پذیرش، نام یا تلفن مالک، شماره پرونده"
            aria-label="جست‌وجوی پرونده"
            autoFocus
          />
          {(flag||params.get('stage')||params.get('coverage')||params.get('status'))&&<div className="row" aria-label="فیلترهای فعال">{flag&&<span className="chip chip-blue">{FLAGS.find(f=>f.key===flag)?.label??flag}</span>}{params.get('stage')&&<span className="chip">{STAGE_LABELS[params.get('stage') as keyof typeof STAGE_LABELS]??params.get('stage')}</span>}{params.get('coverage')&&<span className="chip">{COVERAGE_LABELS[params.get('coverage') as keyof typeof COVERAGE_LABELS]??params.get('coverage')}</span>}{params.get('status')&&<span className="chip">وضعیت: {({open:'باز',closed:'بسته',cancelled:'لغوشده',all:'همه'} as Record<string,string>)[params.get('status')!]??params.get('status')}</span>}<button type="button" className="btn btn-sm" onClick={()=>update({flag:null,stage:null,coverage:null,status:null,page:null})}>برداشتن فیلتر</button></div>}
          <details className="case-filters compact-disclosure"><summary>فیلترها{[flag,params.get('stage'),params.get('coverage'),params.get('status')].filter(Boolean).length?' (فعال)':''}</summary><div className="stack">
          <div className="row">
            {FLAGS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`chip${flag === f.key ? ' chip-blue' : ''}`}
                style={{ cursor: 'pointer', fontSize: 'var(--fs-s)', minHeight: 44, padding: '6px 12px' }}
                aria-pressed={flag === f.key}
                onClick={() => update({ flag: flag === f.key ? null : f.key, page: null })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="row">
            <select
              className="input"
              style={{ width: 'auto' }}
              aria-label="مرحله"
              value={params.get('stage') ?? ''}
              onChange={(e) => update({ stage: e.target.value || null, page: null })}
            >
              <option value="">همه مراحل</option>
              {CASE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: 'auto' }}
              aria-label="نوع پوشش"
              value={params.get('coverage') ?? ''}
              onChange={(e) => update({ coverage: e.target.value || null, page: null })}
            >
              <option value="">همه پوشش‌ها</option>
              {COVERAGE_TYPES.map((c) => (
                <option key={c} value={c}>
                  {COVERAGE_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: 'auto' }}
              aria-label="وضعیت"
              value={params.get('status') ?? 'open'}
              onChange={(e) => update({ status: e.target.value === 'open' ? null : e.target.value, page: null })}
            >
              <option value="open">پرونده‌های باز</option>
              <option value="closed">بسته</option>
              <option value="cancelled">لغوشده</option>
              <option value="all">همه</option>
            </select>
            {params.toString() && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setQ('');
                  router.replace('/cases');
                }}
              >
                حذف فیلترها
              </button>
            )}
          </div></div></details>
        </div>
      </div>

      {error && <div className="callout callout-red">فهرست پرونده‌ها بارگذاری نشد.</div>}

      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="table responsive">
          <thead>
            <tr>
              <th>پرونده و پذیرش</th>
              <th>پلاک</th>
              <th>خودرو و مالک</th>
              <th>پوشش</th>
              <th>مرحله</th>
              <th>مسئول</th>
              <th>مهلت</th>
              <th>پیشرفت</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => {
              const commitment = c.officialDeadlineAt ?? c.forecastDeliveryAt;
              const tone = deadlineTone(commitment, c.status === 'open' && c.stage !== 'delivered');
              return (
                <tr key={c.id} onClick={() => router.push(`/cases/${c.id}`)}>
                  <td>
                    <Link href={`/cases/${c.id}`} className="num" style={{ fontWeight: 700 }} onClick={(e) => e.stopPropagation()}>
                      {toPersianDigits(c.caseNumber)}
                    </Link>
                    {c.admissionNo?<div className="small">پذیرش ایران‌خودرو: <bdi>{toPersianDigits(c.admissionNo)}</bdi></div>:<div className="small muted">بدون شماره پذیرش</div>}
                    <div className="xs muted">تاریخ پذیرش {formatJalali(c.admittedAt)}</div>
                  </td>
                  <td>
                    <Plate value={c.plate} />
                  </td>
                  <td>
                    <VehicleDisclosure label={c.vehicleSummary ?? c.vehicleLabel} />
                    <div className="xs muted">{c.customerName ?? 'مالک نامشخص'}</div>
                  </td>
                  <td className="hide-sm">
                    <CoverageChip coverage={c.coverageType} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <StageChip stage={c.stage} />
                      {c.openBlockers > 0 && <span className="chip chip-red">{faNum(c.openBlockers)} مانع</span>}
                      {c.missingFields.length > 0 && (
                        <span
                          className="chip chip-amber"
                          title={c.missingFields.map((m) => MISSING_FIELD_LABELS[m] ?? m).join('، ')}
                        >
                          نیازمند تکمیل
                        </span>
                      )}
                      {c.isLegacyEntry && <span className="chip">ثبت از قبل</span>}
                    </div>
                  </td>
                  <td className="hide-sm">{c.responsible?.displayName ?? <span className="missing">تعیین نشده</span>}</td>
                  <td>
                    {commitment ? (
                      <>
                        <div className="num">{formatJalali(commitment)}</div>
                        <div
                          className="xs"
                          style={{ color: tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--steel)' }}
                        >
                          {c.officialDeadlineAt ? 'رسمی، ' : 'پیش‌بینی، '}
                          {relativeDays(commitment)}
                        </div>
                      </>
                    ) : (
                      <span className="muted xs">ثبت نشده</span>
                    )}
                  </td>
                  <td className="hide-sm">
                    <div className="progress" title={`${c.progressPercent}٪`}>
                      <i style={{ width: `${c.progressPercent}%` }} />
                    </div>
                    <div className="xs muted num">{faNum(c.progressPercent)}٪</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <div className="panel-body muted">
            {params.toString()
              ? 'پرونده‌ای با این جست‌وجو یا فیلتر پیدا نشد. عبارت را کوتاه‌تر کنید یا فیلترها را بردارید.'
              : 'هنوز پرونده‌ای ثبت نشده است. اولین خودروی تصادفی را از «ثبت پرونده» وارد کنید.'}
          </div>
        )}
        {isLoading && !data && <div className="panel-body muted">در حال بارگذاری…</div>}
      </div>

      {pages > 1 && (
        <div className="row">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            صفحه قبل
          </button>
          <span className="small num">
            صفحه {faNum(page)} از {faNum(pages)}
          </span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
            صفحه بعد
          </button>
        </div>
      )}
    </div>
  );
}

export default function CasesPage() {
  return (
    <Suspense>
      <CasesList />
    </Suspense>
  );
}
