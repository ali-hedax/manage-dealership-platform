'use client';

import { useRef, useState } from 'react';
import type { Assessment, AssessmentImportPreview, AssessmentImportStatus } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { faNum, rial, toPersianDigits } from '@/lib/format';
import { Dialog } from './Dialog';

const STATUS_CHIP: Record<AssessmentImportStatus, [string, string]> = {
  final: ['نهایی', 'chip chip-green'], rejected: ['ردشده', 'chip chip-red'], correction: ['درخواست اصلاح', 'chip chip-amber'],
  unknown: ['نامشخص', 'chip chip-amber'], blank: ['بدون وضعیت', 'chip chip-amber'],
};
const Status = ({ status, text }: { status: AssessmentImportStatus; text?: string }) =>
  <span className={STATUS_CHIP[status][1]} title={text || undefined}>{STATUS_CHIP[status][0]}</span>;
const fa = (s: string | null) => s ? toPersianDigits(s) : '—';

export function AssessmentImport({ assessment, onClose, onDone }: { assessment: Assessment; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState<'rial' | 'toman'>('rial');
  const [preview, setPreview] = useState<{ result: AssessmentImportPreview; base64: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false);
  const request = useRef(0);
  function clear() { ++request.current; setPreview(null); setError(''); setConfirmed(false); setBusy(false); }
  async function read() {
    if (!file) return;
    const token = ++request.current;
    setBusy(true); setError(''); setPreview(null); setConfirmed(false);
    try {
      if (file.size > 4_000_000 || !file.name.toLowerCase().endsWith('.xlsx')) throw new Error('فایل باید اکسل xlsx و کمتر از ۴ مگابایت باشد');
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const base64 = btoa(binary);
      const result = await api<AssessmentImportPreview>(`/assessments/${assessment.id}/import`, { body: { fileBase64: base64, currency, dryRun: true, expectedVersion: assessment.version } });
      if (request.current === token) setPreview({ result, base64 });
    } catch (e) { if (request.current === token) setError(errorMessage(e)); }
    finally { if (request.current === token) setBusy(false); }
  }
  async function apply() {
    if (!preview || !confirmed) return;
    setBusy(true); setError('');
    try {
      await api(`/assessments/${assessment.id}/import`, { body: { fileBase64: preview.base64, currency, dryRun: false, expectedVersion: assessment.version } });
      onDone();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const r = preview?.result;
  const many = (r?.summary.sheets ?? 0) > 1;
  // Where a row came from, for checking against the printed report.
  const origin = (x: { sheet: string; row: number; page: number | null }) =>
    [many && x.sheet ? `برگه ${x.sheet}` : '', x.page ? `صفحه ${faNum(x.page)}` : '', x.row ? `ردیف ${faNum(x.row)}` : ''].filter(Boolean).join('، ') || 'کل فایل';
  const total = (computed: number, declared: number | null) => <>{rial(computed)}{declared !== null && (declared === computed
    ? <span className="small import-total-ok"> · برابر با جمع فایل</span>
    : <span className="small import-total-bad"> · جمع فایل {rial(declared)}</span>)}</>;
  const parts = r?.rows.filter(x => x.action === 'replace').length ?? 0, labour = (r?.rows.length ?? 0) - parts;
  return <Dialog open title="دریافت اکسل کارشناسی" onClose={() => { if (!busy) onClose(); }} footer={<>
    <button type="button" className="btn" disabled={busy} onClick={onClose}>بستن</button>
    <button type="button" className="btn btn-primary" disabled={busy || !r || !!r.errors.length || !r.rows.length || !confirmed} onClick={() => void apply()}>افزودن به پیش‌نویس</button>
  </>}><div className="stack" data-testid="assessment-import">
    <p className="small muted">فایل کپی‌شده از PDF را بارگذاری کنید؛ همهٔ صفحه‌ها و برگه‌ها خوانده می‌شوند. «بررسی و پیش‌نمایش» چیزی ثبت نمی‌کند. اقلام قبلی تطبیق می‌خورند و تکراری ثبت نمی‌شوند؛ اقلام غایب از فایل خودکار حذف نمی‌شوند.</p>
    <label className="field"><span>فایل کارشناسی (.xlsx)</span><input type="file" className="input" disabled={busy} accept=".xlsx" onChange={e => { clear(); setFile(e.target.files?.[0] ?? null); }} /></label>
    <label className="field"><span>واحد مبلغ در فایل</span><select className="input" disabled={busy} value={currency} onChange={e => { clear(); setCurrency(e.target.value as 'rial' | 'toman'); }}><option value="rial">ریال</option><option value="toman">تومان</option></select></label>
    <button type="button" className="btn" disabled={!file || busy} onClick={() => void read()}>{busy ? 'در حال بررسی…' : 'بررسی و پیش‌نمایش'}</button>
    {error && <p className="callout callout-red" role="alert">{error}</p>}
    {r && <>
      <p role="status">{faNum(parts)} قطعه و {faNum(labour)} اجرت قابل ورود؛ {faNum(r.setAside.length)} ردیف ردشده یا نیازمند اصلاح و {faNum(r.equivalents.length)} اجرت معادل جدا نگه داشته شد</p>
      {r.lineCounts && <p className="import-line-counts" data-testid="import-line-counts">{faNum(r.lineCounts.new)} قلم تازه، {faNum(r.lineCounts.unchanged)} قلم تکراری، {faNum(r.lineCounts.rejected)} قلم رد شده، {faNum(r.lineCounts.replacements)} قلم جایگزین{r.lineCounts.updated ? `، ${faNum(r.lineCounts.updated)} قلم اصلاح‌شده` : ''}</p>}
      {!!r.rejectedExisting?.length && <div className="callout callout-amber" data-testid="import-rejected-existing">این اقلام قبلی در فایل «رد» شده‌اند؛ حذف نمی‌شوند، با نشان «رد شده» می‌مانند و دیگر نیاز تأمین حساب نمی‌شوند:<ul>{r.rejectedExisting.map((x) => <li key={x.itemId}>{x.description}{x.code ? <> · <bdi>{toPersianDigits(x.code)}</bdi></> : null} ({origin(x)})</li>)}</ul></div>}
      {!!r.errors.length && <div className="callout callout-red" role="alert">فایل خطا دارد؛ هیچ ردیفی ثبت نمی‌شود.<ul>{r.errors.map((x, i) => <li key={i}>{origin(x)}: {x.message}</li>)}</ul></div>}
      {!!r.warnings.length && <div className="callout callout-amber" data-testid="import-warnings">پیش از ثبت بررسی کنید:<ul>{r.warnings.map((x, i) => <li key={i}>{origin(x)}: {x.message}</li>)}</ul></div>}
      <dl className="dl import-summary" data-testid="import-summary">
        <dt>صفحه و برگه</dt><dd>{r.summary.pages ? `${faNum(r.summary.pages)} صفحه چاپی` : 'بدون شماره صفحه'}{many ? `، ${faNum(r.summary.sheets)} برگه` : ''}</dd>
        <dt>قطعات</dt><dd>{faNum(r.summary.parts.final)} نهایی، {faNum(r.summary.parts.rejected)} ردشده{r.summary.parts.correction ? `، ${faNum(r.summary.parts.correction)} درخواست اصلاح` : ''}</dd>
        <dt>اجرت خسارتی</dt><dd>{faNum(r.summary.labour.final)} نهایی{r.summary.labour.rejected ? `، ${faNum(r.summary.labour.rejected)} ردشده` : ''}{r.summary.labour.correction ? `، ${faNum(r.summary.labour.correction)} درخواست اصلاح` : ''}</dd>
        <dt>اجرت‌های معادل</dt><dd>{faNum(r.summary.equivalents.final)} نهایی، {faNum(r.summary.equivalents.rejected)} ردشده{r.summary.equivalents.unknown ? `، ${faNum(r.summary.equivalents.unknown)} نامشخص` : ''} · بدون مبلغ جدا، خارج از جمع</dd>
        <dt>جمع قطعات</dt><dd>{total(r.summary.partsRial, r.summary.declared.partsRial)}</dd>
        <dt>اجرت</dt><dd>{total(r.summary.labourRial, r.summary.declared.labourRial)}</dd>
        <dt>مجموع</dt><dd><strong>{total(r.summary.totalRial, r.summary.declared.totalRial)}</strong></dd>
        {!!r.summary.dates.length && <><dt>تاریخ ردیف‌ها</dt><dd>{r.summary.dates.map(fa).join('، ')}</dd></>}
      </dl>
      <div className="table-scroll import-preview-table"><table className="table static"><caption className="sr-only">اقلام قابل ورود</caption><thead><tr><th>محل در فایل</th><th>نتیجه تطبیق</th><th>نوع / شرح</th><th>کد</th><th>تعداد</th><th>واحد</th><th>تاریخ</th><th>مبلغ کل</th></tr></thead><tbody>{r.rows.map((x, i) => <tr key={i}>
        <td className="small">{origin(x)}</td>
        <td>{x.outcome === 'replacement' && x.replaces ? <>جایگزین «{x.replaces.description}»{x.replaces.basis === 'probable' ? ' (احتمالی؛ از روی کد فنی یکسان)' : ''}</> : x.outcome === 'unchanged' ? 'قبلی؛ بدون ثبت دوباره' : x.outcome === 'updated' ? 'اصلاح قلم قبلی' : 'قلم جدید'}</td>
        <td><span className="chip">{x.action === 'replace' ? 'قطعه' : 'اجرت'}</span> {x.description}</td>
        <td><bdi>{x.partNumber || x.evidence.match(/کد اجرت (.+)$/)?.[1] || '—'}</bdi></td>
        <td>{faNum(x.quantity)}</td><td>{x.unit ? toPersianDigits(x.unit) : '—'}</td><td><bdi>{fa(x.date)}</bdi></td>
        <td>{rial(x.quantity * x.unitPriceRial + x.labourRial)}</td></tr>)}</tbody></table></div>
      {!!r.setAside.length && <details className="compact-disclosure" data-testid="import-set-aside"><summary>ردیف‌های ردشده یا نیازمند اصلاح ({faNum(r.setAside.length)}) — وارد اقلام فعال و تأمین نمی‌شوند</summary>
        <div className="table-scroll import-preview-table"><table className="table static"><thead><tr><th>محل در فایل</th><th>وضعیت</th><th>نوع / شرح</th><th>کد</th><th>تعداد</th><th>تاریخ</th><th>مبلغ</th></tr></thead><tbody>{r.setAside.map((x, i) => <tr key={i}>
          <td className="small">{origin(x)}</td><td><Status status={x.status} text={x.statusText} /></td>
          <td><span className="chip">{x.kind === 'part' ? 'قطعه' : 'اجرت'}</span> {x.description}</td><td><bdi>{x.code ?? '—'}</bdi></td>
          <td>{x.quantity === null ? '—' : faNum(x.quantity)}</td><td><bdi>{fa(x.date)}</bdi></td><td>{x.amountRial === null ? '—' : rial(x.amountRial)}</td></tr>)}</tbody></table></div></details>}
      {!!r.equivalents.length && <details className="compact-disclosure" data-testid="import-equivalents"><summary>اجرت‌های معادل ({faNum(r.equivalents.length)}) — برای سابقه؛ مبلغ مستقل ندارند و دوباره به جمع اضافه نمی‌شوند</summary>
        <div className="table-scroll import-preview-table"><table className="table static"><thead><tr><th>محل در فایل</th><th>وضعیت</th><th>شرح عملیات</th><th>کد اجرت</th></tr></thead><tbody>{r.equivalents.map((x, i) => <tr key={i}>
          <td className="small">{origin(x)}</td><td><Status status={x.status} text={x.statusText} /></td><td>{x.description}</td><td><bdi>{x.code ?? '—'}</bdi></td></tr>)}</tbody></table></div></details>}
      {!!r.skipped.length && <details className="compact-disclosure"><summary>یادداشت‌های خواندن فایل ({faNum(r.skipped.length)})</summary><ul>{r.skipped.map((x, i) => <li key={i}>{origin(x)}: {x.reason}</li>)}</ul></details>}
      <p className="small muted">این مرحله فقط پیش‌نویس کارشناسی را تکمیل می‌کند و تأیید رسمی نیست؛ ردیف‌های ردشده و اجرت‌های معادل فقط در سابقهٔ ورود ثبت می‌شوند. برای ارسال، اقلام را در کارشناسی انتخاب و «ارسال به قطعات و تأمین» را بزنید. اجرت واردشده را برای ارجاع به رشتهٔ مربوط ویرایش کنید.</p>
      <label className="check"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> اقلام و واحد مبلغ را بررسی کردم</label>
    </>}
  </div></Dialog>;
}
