'use client';

import { useRef, useState } from 'react';
import type { Assessment, AssessmentImportPreview } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { faNum, rial } from '@/lib/format';
import { Dialog } from './Dialog';

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
  return <Dialog open title="دریافت اکسل کارشناسی" onClose={() => { if (!busy) onClose(); }} footer={<>
    <button type="button" className="btn" disabled={busy} onClick={onClose}>بستن</button>
    <button type="button" className="btn btn-primary" disabled={busy || !preview || !!preview.result.errors.length || !preview.result.rows.length || !confirmed} onClick={() => void apply()}>افزودن به پیش‌نویس</button>
  </>}><div className="stack" data-testid="assessment-import">
    <p className="small muted">فایل کپی‌شده از PDF را بارگذاری کنید. ستون‌ها از روی عنوان شناسایی می‌شوند؛ قطعات و اجرت جدا خوانده می‌شوند.</p>
    <label className="field"><span>فایل کارشناسی (.xlsx)</span><input type="file" className="input" disabled={busy} accept=".xlsx" onChange={e => { clear(); setFile(e.target.files?.[0] ?? null); }} /></label>
    <label className="field"><span>واحد مبلغ در فایل</span><select className="input" disabled={busy} value={currency} onChange={e => { clear(); setCurrency(e.target.value as 'rial' | 'toman'); }}><option value="rial">ریال</option><option value="toman">تومان</option></select></label>
    <button type="button" className="btn" disabled={!file || busy} onClick={() => void read()}>{busy ? 'در حال بررسی…' : 'بررسی و پیش‌نمایش'}</button>
    {error && <p className="callout callout-red" role="alert">{error}</p>}
    {preview && <>
      <p role="status">{faNum(preview.result.rows.length)} قلم آماده بررسی؛ {faNum(preview.result.skipped.length)} مورد کنار گذاشته‌شده</p>
      {!!preview.result.errors.length && <div className="callout callout-red" role="alert">فایل خطا دارد؛ هیچ ردیفی ثبت نمی‌شود.<ul>{preview.result.errors.map((r, i) => <li key={i}>{r.sheet}، ردیف {faNum(r.row)}: {r.message}</li>)}</ul></div>}
      <div className="table-scroll import-preview-table"><table className="table static"><thead><tr><th>ردیف فایل</th><th>نوع / شرح</th><th>کد قطعه</th><th>تعداد</th><th>مبلغ کل (ریال)</th></tr></thead><tbody>{preview.result.rows.map((r, i) => <tr key={i}><td>{faNum(r.row)}</td><td><span className="chip">{r.action === 'replace' ? 'قطعه' : 'اجرت'}</span> {r.description}</td><td><bdi>{r.partNumber || '—'}</bdi></td><td>{faNum(r.quantity)}</td><td>{rial(r.quantity * r.unitPriceRial + r.labourRial)}</td></tr>)}</tbody></table></div>
      {!!preview.result.skipped.length && <details className="compact-disclosure"><summary>ردیف‌های کنار گذاشته‌شده</summary><ul>{preview.result.skipped.map((r, i) => <li key={i}>{r.sheet}، ردیف {faNum(r.row)}: {r.reason}</li>)}</ul></details>}
      <p className="small muted">این مرحله فقط پیش‌نویس کارشناسی را تکمیل می‌کند؛ تأیید رسمی و ایجاد درخواست قطعه در مراحل جدا انجام می‌شوند. اجرت واردشده را برای ارجاع به رشتهٔ مربوط ویرایش کنید.</p>
      <label className="check"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> اقلام و واحد مبلغ را بررسی کردم</label>
    </>}
  </div></Dialog>;
}
