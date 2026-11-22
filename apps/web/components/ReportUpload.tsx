'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ReferenceImport, ReportDetectResult } from '@manage/shared';
import { api, errorMessage } from '@/lib/api';
import { faNum } from '@/lib/format';

type Row = { name: string; status: string; detail?: string; href?: string; previewId?: string; ready?: number; applied?: boolean };
const KIND_LABEL: Record<string, string> = { emdad: 'گزارش امداد ویژه', stock: 'گزارش موجودی کسب‌وکار', customers: 'سوابق پذیرش (تعمیرات خودرو)', appointments: 'لیست نوبت پذیرش' };

async function b64(f: File) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function sendDaily(kind: 'emdad' | 'stock', f: File) {
  const res = await fetch(`/api/v1/daily-reports/uploads?kind=${kind}&fileName=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-manage-client': 'web', 'content-type': 'application/octet-stream' }, body: f });
  const body = await res.json().catch(() => null) as { message?: string } | null;
  if (!res.ok) throw new Error(body?.message ?? 'بارگذاری انجام نشد');
}

/**
 * One upload for every ISACO report: each file is recognized by its content (never its name) and
 * handed to the existing import of that report, which keeps its own preview and confirmation.
 */
export function ReportUpload({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([]), [busy, setBusy] = useState(false);
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  async function choose(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, 10);
    setRows(files.map((f) => ({ name: f.name, status: 'در حال شناسایی…' })));
    setBusy(true);
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      try {
        if (f.size > 5_000_000) { update(i, { status: 'پذیرفته نشد', detail: 'فایل باید کمتر از پنج مگابایت باشد' }); continue; }
        const fileBase64 = await b64(f);
        const d = await api<ReportDetectResult>('/report-center/detect', { body: { fileName: f.name, fileBase64 } });
        if (!d.kind) { update(i, { status: 'شناخته نشد', detail: d.message, href: '/reference-data' }); continue; }
        if (d.kind === 'emdad' || d.kind === 'stock') {
          await sendDaily(d.kind, f);
          update(i, { status: KIND_LABEL[d.kind]!, detail: 'پیش‌نمایش آماده است؛ بررسی و تأیید در گزارش‌های روزانه', href: `/daily-reports?kind=${d.kind}` });
          continue;
        }
        const p = await api<ReferenceImport>('/reference-imports', { body: { kind: d.kind, fileName: f.name.replace(/\.[^.]+$/, '') + '.xlsx', fileBase64, sheetIndex: d.sheetIndex, headerRow: d.headerRow, mapping: d.mapping } });
        const ready = p.counts.new + p.counts.update;
        update(i, { status: KIND_LABEL[d.kind]!, detail: `${faNum(p.counts.new)} جدید · ${faNum(p.counts.update)} به‌روزرسانی · ${faNum(p.counts.unchanged)} بدون تغییر · ${faNum(p.counts.duplicate + p.counts.error)} نیازمند بررسی`, previewId: p.id, ready, href: `/reference-data?kind=${d.kind}` });
      } catch (e) { update(i, { status: 'خطا', detail: errorMessage(e) }); }
    }
    setBusy(false);
    onDone();
  }
  async function apply(i: number, id: string) {
    setBusy(true);
    try { await api(`/reference-imports/${id}/apply`, { body: {} }); update(i, { applied: true, detail: 'ثبت شد' }); onDone(); }
    catch (e) { update(i, { detail: errorMessage(e) }); } finally { setBusy(false); }
  }
  return (
    <section className="panel" aria-labelledby="rc-upload"><div className="panel-head"><div><h2 id="rc-upload">بارگذاری گزارش‌ها</h2><p className="muted small">چند فایل را با هم انتخاب کنید؛ نوع هر فایل از محتوا و ستون‌هایش شناخته می‌شود. بارگذاری دوباره چیز تکراری نمی‌سازد.</p></div></div>
      <div className="panel-body stack">
        <label className="field"><span>فایل‌های خروجی ایساکو</span><input className="input" type="file" multiple accept=".xls,.xlsx,.xml,.html" disabled={busy} onChange={(e) => { void choose(e.target.files); e.target.value = ''; }} /></label>
        {rows.length > 0 && <div className="table-scroll"><table className="table static"><thead><tr><th>فایل</th><th>نوع</th><th>نتیجه</th><th /></tr></thead><tbody>
          {rows.map((r, i) => <tr key={i}><td><bdi>{r.name}</bdi></td><td>{r.status}</td><td className="small">{r.detail}</td>
            <td className="no-print">{r.previewId && !r.applied && <button type="button" className="btn btn-sm btn-primary" disabled={busy || !r.ready} onClick={() => void apply(i, r.previewId!)}>ثبت {faNum(r.ready ?? 0)} ردیف</button>}{r.href && <Link className="btn btn-sm btn-ghost" href={r.href}>جزئیات</Link>}</td></tr>)}
        </tbody></table></div>}
      </div>
    </section>
  );
}
