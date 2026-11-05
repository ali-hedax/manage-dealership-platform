'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  IMPORT_DEADLINE_TARGETS,
  IMPORT_DEADLINE_TARGET_LABELS,
  VEHICLE_IMPORT_OUTCOMES,
  VEHICLE_IMPORT_OUTCOME_LABELS,
  type ImportDeadlineTarget,
  type VehicleImport,
  type VehicleImportOutcome,
} from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali, toPersianDigits } from '@/lib/format';

const OUTCOME_TONE: Record<VehicleImportOutcome, string> = {
  new: 'chip-green',
  update: 'chip-blue',
  unchanged: '',
  duplicate: 'chip-red',
  incomplete: 'chip-amber',
  needs_review: 'chip-amber',
  error: 'chip-red',
};
const APPLIED: VehicleImportOutcome[] = ['new', 'update'];

/** Original cell of a row by the start of its column header. */
const cell = (source: Record<string, string>, prefix: string) =>
  Object.entries(source).find(([h]) => h.startsWith(prefix))?.[1] ?? '';

/** Existing-vehicle import: upload → Persian preview → apply → per-row result. */
export default function VehicleImportPage() {
  const { can } = useAuth();
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [dateWithoutTime, setDateWithoutTime] = useState(false);
  const [deadlineAs, setDeadlineAs] = useState<ImportDeadlineTarget>('none');
  const [result, setResult] = useState<VehicleImport | null>(null);
  const [filter, setFilter] = useState<VehicleImportOutcome | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!can('case.import')) return <p className="callout callout-amber">ورود گروهی خودروها فقط برای مدیر خدمات فعال است.</p>;

  async function choose(f: File | undefined) {
    setResult(null);
    setError('');
    if (!f) return setFile(null);
    if (f.size > 1_000_000) return setError('حجم فایل باید کمتر از ۱ مگابایت باشد.');
    const buffer = new Uint8Array(await f.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    setFile({ name: f.name, base64: btoa(binary) });
  }

  async function previewFile() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setResult(
        await api<VehicleImport>('/vehicle-imports', {
          body: { fileName: file.name, fileBase64: file.base64, decisions: { dateWithoutTime, deadlineAs } },
        }),
      );
      setFilter('all');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function applyPreview() {
    if (!result) return;
    const n = result.counts.new + result.counts.update;
    if (!window.confirm(`${faNum(n)} ردیف (جدید و به‌روزرسانی) ثبت شود؟ ردیف‌های دیگر بدون تغییر می‌مانند.`)) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api<VehicleImport>(`/vehicle-imports/${result.id}/apply`, { body: {} }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const applicable = result ? result.counts.new + result.counts.update : 0;
  const rows = result?.rows.filter((r) => filter === 'all' || r.outcome === filter) ?? [];
  const applied = result && result.status !== 'preview';

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>ورود خودروهای موجود از اکسل</h1>
          <p className="muted small">
            خروجی xlsx فایل «لیست خودروها». پیش از ثبت، نتیجه هر ردیف نمایش داده می‌شود؛ هیچ ردیفی بی‌صدا حذف نمی‌شود.
          </p>
        </div>
        <Link className="btn" href="/cases">
          بازگشت به پرونده‌ها
        </Link>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>۱. فایل و تصمیم‌ها</h2>
          <a className="btn btn-sm" href="/api/v1/vehicle-imports/sample" download>
            دریافت فایل نمونه (ساختگی)
          </a>
        </div>
        <div className="panel-body stack" style={{ gap: 12 }}>
          <label className="field">
            <span>فایل اکسل (.xlsx)</span>
            <input
              className="input"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={dateWithoutTime} onChange={(e) => setDateWithoutTime(e.target.checked)} />
            <span>
              ثبت تاریخ پذیرش بدون ساعت برای ردیف‌هایی که ساعت ندارند (ساعت «نامعلوم» نمایش داده می‌شود و ساخته نمی‌شود)
            </span>
          </label>
          <label className="field">
            <span>ستون «موعد تحویل» فایل ثبت شود به‌عنوان</span>
            <select className="input" value={deadlineAs} onChange={(e) => setDeadlineAs(e.target.value as ImportDeadlineTarget)}>
              {IMPORT_DEADLINE_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {IMPORT_DEADLINE_TARGET_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <p className="xs muted">
            تطبیق فقط با شماره پرونده Manage، VIN کامل، شماره کارت پذیرش یا شماره شاسی انجام می‌شود؛ نام مالک یا شماره ردیف
            مبنای جایگزینی نیست. خانه خالی فایل مقدار ثبت‌شده را پاک نمی‌کند.
          </p>
          <div>
            <button className="btn btn-primary" disabled={!file || busy} onClick={() => void previewFile()}>
              {busy && !result ? 'در حال بررسی فایل…' : 'پیش‌نمایش'}
            </button>
          </div>
          {error && (
            <div className="callout callout-red" role="alert">
              {error}
            </div>
          )}
        </div>
      </section>

      {result && (
        <section className="panel" data-testid="import-result">
          <div className="panel-head">
            <h2>{applied ? '۳. نتیجه ثبت' : '۲. پیش‌نمایش'}</h2>
            <div className="row" style={{ gap: 6 }}>
              <a className="btn btn-sm" href={`/api/v1/vehicle-imports/${result.id}/report`} download>
                دریافت نتیجه ردیف‌ها (Excel)
              </a>
              {!applied && (
                <button className="btn btn-sm btn-primary" disabled={busy || applicable === 0} onClick={() => void applyPreview()}>
                  {busy ? 'در حال ثبت…' : `ثبت ${faNum(applicable)} ردیف`}
                </button>
              )}
            </div>
          </div>
          <div className="panel-body stack" style={{ gap: 10 }}>
            <p className="small">
              برگه «{result.sheetName}»، سربرگ در ردیف {faNum(result.headerRow)}، {faNum(result.rows.length)} ردیف خودرو
              {result.blankRows.length > 0 && `؛ ${faNum(result.blankRows.length)} ردیف خالی قالب نادیده گرفته شد (ردیف‌های ${toPersianDigits(result.blankRows.join('، '))})`}
              {applied && ` — ثبت ${formatJalali(result.appliedAt, { time: true })}`}
              {result.status === 'partial' && ' — برخی ردیف‌ها ثبت نشدند؛ پس از رفع، همان فایل را دوباره وارد کنید.'}
            </p>
            {result.unmappedColumns.length > 0 && (
              <p className="xs muted">ستون‌های بدون مقصد (در سابقه ورود حفظ می‌شوند): {result.unmappedColumns.join('، ')}</p>
            )}
            <div className="row" role="group" aria-label="فیلتر نتیجه" style={{ gap: 6 }}>
              <button className="btn btn-sm" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                همه ({faNum(result.rows.length)})
              </button>
              {VEHICLE_IMPORT_OUTCOMES.filter((o) => result.counts[o] > 0).map((o) => (
                <button key={o} className="btn btn-sm" aria-pressed={filter === o} onClick={() => setFilter(o)}>
                  <span className={`chip ${OUTCOME_TONE[o]}`}>{VEHICLE_IMPORT_OUTCOME_LABELS[o]}</span> {faNum(result.counts[o])}
                </button>
              ))}
            </div>
            {!applied && applicable < result.rows.length && (
              <p className="xs muted">فقط ردیف‌های «جدید» و «به‌روزرسانی» ثبت می‌شوند. بقیه را در فایل اصلاح کنید و دوباره بارگذاری کنید.</p>
            )}
            <div className="table-scroll">
              <table className="table static import-rows" data-testid="import-rows">
                <thead>
                  <tr>
                    <th>ردیف</th>
                    <th>نتیجه</th>
                    <th>شماره پذیرش</th>
                    <th>شاسی</th>
                    <th>مالک</th>
                    <th>پرونده Manage</th>
                    <th>تغییرات و پیام‌ها</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNo} data-testid="import-row">
                      <td className="num" data-label="ردیف">{faNum(r.rowNo)}</td>
                      <td>
                        <span className={`chip ${OUTCOME_TONE[r.outcome]}`}>{VEHICLE_IMPORT_OUTCOME_LABELS[r.outcome]}</span>
                        {applied && APPLIED.includes(r.outcome) && <div className="xs muted">ثبت شد</div>}
                      </td>
                      <td data-label="پذیرش">{cell(r.source, 'شماره کارت پذیرش')}</td>
                      <td data-label="شاسی">
                        <bdi>{cell(r.source, 'شماره شاسی')}</bdi>
                      </td>
                      <td data-label="مالک">{cell(r.source, 'نام مالک')}</td>
                      <td data-label="پرونده">
                        {r.caseId ? (
                          <Link href={`/cases/${r.caseId}`}>
                            <bdi>{r.caseNumber}</bdi>
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="small wide">
                        {r.changes.length > 0 && (
                          <ul className="plain">
                            {r.changes.map((c, i) => (
                              <li key={i}>
                                {c.field}: {c.from ? `${c.from} ← ` : ''}
                                {c.to}
                              </li>
                            ))}
                          </ul>
                        )}
                        {r.messages.length > 0 && (
                          <ul className="issues">
                            {r.messages.map((m, i) => (
                              <li key={i} className={m.level === 'info' ? 'is-info' : m.level === 'warning' ? 'is-warning' : undefined}>
                                {m.text}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
