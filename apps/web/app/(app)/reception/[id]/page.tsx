'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import {
  RECEPTION_EVENT_LABELS, RECEPTION_EXTERNAL_STATE_LABELS, formatJalali, officialLabourName, toPersianDigits,
  type ReceptionDetail, type ReceptionExternalWork,
} from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, parseAmount, rial } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { AppIcon } from '@/components/AppIcon';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { JalaliInput } from '@/components/JalaliInput';
import { Plate } from '@/components/Plate';

// «پروندهٔ پذیرش» (spec section 26): everything from کسب‌وکار is read only; Manage adds work
// outside the dealership (basis of a future ARPAST link) and notes. Nothing in an accident case
// changes from here; a unique match is only shown as a link.

const t = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : toPersianDigits(String(v)));
const day = (iso: string | null) => (iso ? formatJalali(iso, { time: true }) : '—');

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="dl rcp-facts">{rows.map(([k, v]) => <div key={k} className="rcp-fact"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export default function ReceptionFolderPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data: r, error, mutate } = useSWR<ReceptionDetail>(can('reception.read') ? `/reception/${id}` : null, fetcher);
  if (!can('reception.read')) return <EmptyState icon="lock" title="پروندهٔ پذیرش" heading="h1">برای این بخش مجوز ندارید.</EmptyState>;
  if (error) return <p role="alert" className="m-error">{errorMessage(error)}</p>;
  if (!r) return <p className="muted small" role="status">در حال خواندن پروندهٔ پذیرش…</p>;
  const saved = (next: ReceptionDetail) => void mutate(next, { revalidate: false });
  const parts = r.parts.filter((p) => !p.removedAt);
  return (
    <div className="stack rcp-folder">
      <header className="panel rcp-head" aria-label="سربرگ پذیرش">
        <div className="rcp-head-main">
          <div>
            <h1>{r.vehicle.shortName ?? 'خودرو'}</h1>
            <p className="rcp-head-who">{r.customer.name ?? 'مشتری ثبت نشده'}</p>
            <p className="rcp-head-ids">پذیرش <bdi>{t(r.admissionNo)}</bdi> · کارت <bdi>{t(r.cardNo)}</bdi></p>
          </div>
          <Plate value={r.plate} size="xl" />
        </div>
        <div className="row">
          <span className={`m-tag ${r.isOpen ? 'mute' : 'ok'}`}>{r.statusText ?? r.statusCode ?? (r.isOpen ? 'باز' : 'ترخیص‌شده')}</span>
          {!r.isOpen && r.admission.releasedAt && <span className="small muted">ترخیص {day(r.admission.releasedAt)}</span>}
          {r.case && <Link className="m-tag wait" href={`/cases/${r.case.id}`}>پروندهٔ تصادفی {t(r.case.caseNumber)}</Link>}
          {r.linkState === 'ambiguous' && <span className="m-tag stop" title="چند پروندهٔ تصادفی با این پذیرش یا VIN جور شد؛ مدیر سیستم بررسی می‌کند">تطبیق تصادفی نیازمند بررسی</span>}
          <span className="xs muted">آخرین خواندن از کسب‌وکار: {day(r.lastSeenAt)}</span>
        </div>
      </header>

      <details className="panel rcp-sec">
        <summary className="panel-head"><h2>خودرو</h2><span className="small muted">{t(r.vehicle.fullModel)}</span></summary>
        <div className="panel-body">
          <Facts rows={[
            ['شاسی', <bdi dir="ltr" key="c">{t(r.vehicle.chassis)}</bdi>], ['VIN', <bdi dir="ltr" key="v">{r.vehicle.vin ?? '—'}</bdi>], ['شماره موتور', <bdi dir="ltr" key="e">{t(r.vehicle.engineNo)}</bdi>],
            ['مدل کامل', t(r.vehicle.fullModel)], ['کد محصول', t(r.vehicle.productCode)], ['کد مدل', t(r.vehicle.modelCode)], ['رنگ', t(r.vehicle.color)],
            ['کیلومتر ورود', r.vehicle.entranceKm == null ? '—' : faNum(r.vehicle.entranceKm)], ['تاریخ تحویل خودرو', t(r.vehicle.deliveredOn)],
            ['کارت طلایی', r.vehicle.goldCard ? `${t(r.vehicle.goldCard.type)} · ${t(r.vehicle.goldCard.id)} · اعتبار ${t(r.vehicle.goldCard.expires)}` : 'ندارد'],
            ['احتمال تصادفی', t(r.vehicle.accident)],
          ]} />
        </div>
      </details>

      <section className="panel rcp-sec" aria-labelledby="rcp-customer">
        <div className="panel-head"><h2 id="rcp-customer">مشتری و تحویل‌دهنده</h2></div>
        <div className="panel-body">
          <Facts rows={[
            ['نام مالک', t(r.customer.name)], ['موبایل', <bdi dir="ltr" key="m">{t(r.customer.mobile)}</bdi>], ['تلفن', <bdi dir="ltr" key="p">{t(r.customer.phone)}</bdi>],
            ['کد ملی', <bdi dir="ltr" key="n">{t(r.customer.nationalId)}</bdi>], ['نشانی', t(r.customer.address)],
            ['تحویل‌دهنده', t(r.customer.delivererName)], ['موبایل تحویل‌دهنده', <bdi dir="ltr" key="d">{t(r.customer.delivererMobile)}</bdi>],
          ]} />
        </div>
      </section>

      <section className="panel rcp-sec" aria-labelledby="rcp-admission">
        <div className="panel-head"><h2 id="rcp-admission">پذیرش</h2></div>
        <div className="panel-body">
          <Facts rows={[
            ['شماره و زمان پذیرش', <span key="a"><bdi>{t(r.admissionNo)}</bdi> · {day(r.admission.admittedAt)}</span>], ['نحوهٔ ثبت', t(r.admission.recordType)], ['نوع ورود', t(r.admission.entryType)],
            // One «سالن تعمیرات» (H4 part 3): the confirmed column, else the same DssdDesc as read.
            ['سالن تعمیرات', t(r.admission.hall ?? r.admission.station)], ['پذیرشگر', t(r.admission.receptionist)], ['ترخیص تخمینی', day(r.admission.exitEstimate)],
            ['وضعیت رسمی', t(r.statusText ?? r.statusCode)], ['وضعیت گارانتی', t(r.admission.warrantyStatus)],
            ['برآورد هزینه', r.admission.costEstimateRial == null ? '—' : rial(r.admission.costEstimateRial)], ['هزینهٔ نهایی مشتری', r.admission.finalCostRial == null ? '—' : rial(r.admission.finalCostRial)],
            ['توضیحات', t(r.admission.description)],
          ]} />
        </div>
      </section>

      <section className="panel rcp-sec" aria-labelledby="rcp-defects">
        <div className="panel-head"><div><h2 id="rcp-defects">ایرادها و اجرت‌ها</h2><p className="small muted">از کسب‌وکار، فقط‌خواندنی</p></div></div>
        <div className="panel-body stack">
          {!r.defects.length && !r.repairs.length && <p className="m-empty">ایراد یا اجرتی روی کارت ثبت نشده است.</p>}
          {r.defects.length > 0 && <ul className="rcp-lines">{r.defects.map((d) => <li key={d.id} className={d.removedAt ? 'is-removed' : ''}><strong>{d.customerText ?? d.groupTitle ?? 'ایراد'}</strong>{d.groupCode && <bdi className="small muted"> {d.groupCode}{d.customerText && d.groupTitle ? ` · ${d.groupTitle}` : ''}</bdi>}{d.expertText && <span className="small"> · کارشناس: {d.expertText}</span>}<span className="row xs">{d.state && <span className="m-tag mute">{d.state}</span>}{d.removedAt && <span className="m-tag stop">حذف‌شده در کسب‌وکار</span>}</span></li>)}</ul>}
          {r.repairs.length > 0 && <div className="table-scroll"><table className="table static"><thead><tr><th scope="col">نام اجرت</th><th scope="col">کد</th><th scope="col">تعمیرکار</th><th scope="col">جایگاه</th><th scope="col">وضعیت</th><th scope="col" title="ستون DrerIntialPrice کسب‌وکار">مبلغ اجرت</th><th scope="col">مبلغ نهایی</th><th scope="col">گارانتی</th></tr></thead><tbody>
            {r.repairs.map((x) => <tr key={x.id} className={x.removedAt || x.declined ? 'is-removed' : ''} data-declined={x.declined || undefined}><td>{officialLabourName(x.name ?? x.description, x.code)}{x.declined && <span className="m-tag stop" title="مشتری انجام این اجرت را نخواست؛ در شمارش کار انجام‌شده نیامده"> عدم تمایل · در شمارش کار نیست</span>}{x.manual && <span className="m-tag wait"> دستی</span>}{x.removedAt && <span className="m-tag stop"> {x.manual ? 'جایگزین با دادهٔ پالس' : 'حذف‌شده در کسب‌وکار'}</span>}</td><td><bdi dir="ltr">{t(x.code)}</bdi></td><td>{t(x.technician)}</td><td>{t(x.station)}</td><td>{x.state ?? '—'}</td><td>{x.priceRial == null ? '—' : rial(x.priceRial)}</td><td>{x.finalPriceRial == null ? '—' : rial(x.finalPriceRial)}</td><td>{t(x.warranty)}</td></tr>)}
          </tbody></table></div>}
        </div>
      </section>

      <section className="panel rcp-sec" aria-labelledby="rcp-parts">
        <div className="panel-head"><div><h2 id="rcp-parts">قطعات</h2><p className="small muted">از کسب‌وکار، فقط‌خواندنی · {faNum(parts.length)} قلم روی کارت</p></div></div>
        <div className="panel-body">
          {!r.parts.length ? <p className="m-empty">قطعه‌ای روی کارت ثبت نشده است.</p> : <ul className="rcp-lines" data-testid="reception-parts">{r.parts.map((p) => (
            <li key={p.id} className={p.removedAt || p.rejectReason ? 'is-removed' : ''}>
              <span className="rcp-line-name"><strong>{p.name ?? 'قطعه'}</strong> <bdi className="small muted">{t(p.code)}</bdi></span>
              <span className="row xs">
                <span>درخواستی {t(p.qtyRequested)} · نهایی {t(p.qtyFinal)}</span>
                {p.unitPriceRial != null && <span>فی {rial(p.unitPriceRial)}</span>}
                {p.totalPriceRial != null && <span>کل {rial(p.totalPriceRial)}</span>}
                {p.state && <span className="m-tag mute">{p.state}</span>}
                {p.specialAid && <span className="m-tag em">امداد ویژه</span>}
                {p.rejectReason && <span className="m-tag stop">رد: {p.rejectReason}</span>}
                {p.removedAt && <span className="m-tag stop">حذف‌شده در کسب‌وکار</span>}
              </span>
            </li>))}</ul>}
        </div>
      </section>

      <ExternalWorkSection r={r} onSaved={saved} />
      <NotesSection r={r} onSaved={saved} />

      <section className="panel rcp-sec" aria-labelledby="rcp-history">
        <div className="panel-head"><h2 id="rcp-history">تاریخچه</h2></div>
        <div className="panel-body">
          {!r.events.length ? <p className="m-empty">هنوز رویدادی ثبت نشده است.</p> : <ul className="timeline">{r.events.map((e) => (
            <li key={e.id}><div><strong>{RECEPTION_EVENT_LABELS[e.kind] ?? e.kind}</strong><span className="muted xs"> {day(e.at)}، {e.actorName ?? 'منیج پالس'}</span></div>{e.text && <div className="xs muted">{toPersianDigits(e.text)}</div>}</li>
          ))}</ul>}
        </div>
      </section>
    </div>
  );
}

interface WorkForm { contractorId: string; contractorName: string; description: string; sentAt: string | null; amount: string; note: string; status: 'sent' | 'done' }
const emptyForm = (): WorkForm => ({ contractorId: '', contractorName: '', description: '', sentAt: new Date().toISOString(), amount: '', note: '', status: 'sent' });

/** «کارهای خارج از نمایندگی»: recorded in Manage with version, history and audit. */
function ExternalWorkSection({ r, onSaved }: { r: ReceptionDetail; onSaved: (d: ReceptionDetail) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const allowed = can('reception.external_work');
  const { data: contractors } = useSWR<{ id: string; name: string; specialty: string }[]>(allowed ? '/reception/contractors' : null, fetcher);
  const [form, setForm] = useState<WorkForm | null>(null), [editing, setEditing] = useState<ReceptionExternalWork | null>(null);
  const [cancel, setCancel] = useState<ReceptionExternalWork | null>(null), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(path: string, body: unknown, ok: string) {
    setBusy(true);
    try { onSaved(await api<ReceptionDetail>(path, { body })); toast(ok); return true; }
    catch (e) { toast(errorMessage(e), 'error'); return false; } finally { setBusy(false); }
  }
  async function save() {
    if (!form) return;
    const payload = {
      ...(form.contractorId ? { contractorId: form.contractorId } : { contractorName: form.contractorName.trim() }),
      description: form.description.trim(), sentAt: form.sentAt ?? new Date().toISOString(),
      amountRial: form.amount.trim() ? parseAmount(form.amount) : null, ...(form.note.trim() ? { note: form.note.trim() } : {}),
    };
    const ok = editing
      ? await run(`/reception/external-work/${editing.id}`, { ...payload, status: form.status, expectedVersion: editing.version }, 'کار بیرون ویرایش شد')
      : await run(`/reception/${r.id}/external-work`, payload, 'کار بیرون ثبت شد');
    if (ok) { setForm(null); setEditing(null); }
  }
  async function upload(w: ReceptionExternalWork, file: File) {
    if (file.size > 3 * 1024 * 1024) return toast('فاکتور حداکثر ۳ مگابایت است', 'error');
    const dataBase64 = await new Promise<string>((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1] ?? ''); fr.onerror = () => reject(fr.error); fr.readAsDataURL(file); });
    await run(`/reception/external-work/${w.id}/invoices`, { expectedVersion: w.version, fileName: file.name, mime: file.type, dataBase64 }, 'فاکتور بارگذاری شد');
  }
  const edit = (w: ReceptionExternalWork) => { setEditing(w); setForm({ contractorId: w.contractorId ?? '', contractorName: w.contractorId ? '' : w.contractorName, description: w.description, sentAt: w.sentAt, amount: w.amountRial == null ? '' : String(w.amountRial), note: w.note ?? '', status: w.status === 'done' ? 'done' : 'sent' }); };
  return (
    <section className="panel rcp-sec" aria-labelledby="rcp-external">
      <div className="panel-head"><div><h2 id="rcp-external">کارهای خارج از نمایندگی</h2><p className="small muted">ثبت در منیج؛ مبنای اتصال آینده به آرپاست</p></div>
        {allowed && !form && <button type="button" className="btn btn-sm btn-primary" onClick={() => { setEditing(null); setForm(emptyForm()); }}><AppIcon name="add" />ثبت کار بیرون</button>}</div>
      <div className="panel-body stack">
        {form && <div className="rcp-form stack" aria-label={editing ? 'ویرایش کار بیرون' : 'ثبت کار بیرون'}>
          <div className="grid-2">
            <label className="field"><span>انجام‌دهنده از فهرست</span><select className="input" value={form.contractorId} onChange={(e) => setForm({ ...form, contractorId: e.target.value })}><option value="">— نام آزاد —</option>{contractors?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.specialty}</option>)}</select></label>
            {!form.contractorId && <label className="field"><span>نام انجام‌دهنده</span><input className="input" maxLength={120} value={form.contractorName} onChange={(e) => setForm({ ...form, contractorName: e.target.value })} /></label>}
          </div>
          <label className="field"><span>شرح کار</span><input className="input" maxLength={500} placeholder="مثلاً تراشکاری دیسک چرخ" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="grid-2">
            <JalaliInput label="تاریخ ارسال" value={form.sentAt} onChange={(v) => setForm({ ...form, sentAt: v })} withTime nowButton required />
            <label className="field"><span>مبلغ (ریال)</span><input className="input" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          </div>
          {editing && <label className="field"><span>وضعیت</span><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'sent' | 'done' })}><option value="sent">{RECEPTION_EXTERNAL_STATE_LABELS.sent}</option><option value="done">{RECEPTION_EXTERNAL_STATE_LABELS.done}</option></select></label>}
          <label className="field"><span>توضیح</span><textarea className="input" rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="row"><button type="button" className="btn btn-primary" disabled={busy || !form.description.trim() || (!form.contractorId && !form.contractorName.trim())} onClick={() => void save()}>ذخیره</button><button type="button" className="btn btn-ghost" onClick={() => { setForm(null); setEditing(null); }}>انصراف</button></div>
        </div>}
        {!r.externalWork.length && !form && <p className="m-empty">کار خارج از نمایندگی برای این پذیرش ثبت نشده است.</p>}
        {r.externalWork.length > 0 && <ul className="rcp-lines">{r.externalWork.map((w) => (
          <li key={w.id} className={w.status === 'cancelled' ? 'is-removed' : ''} data-testid="external-work">
            <span className="rcp-line-name"><strong>{w.description}</strong> <span className="small muted">· {w.contractorName}</span></span>
            <span className="row xs">
              <span className={`m-tag ${w.status === 'done' ? 'ok' : w.status === 'cancelled' ? 'stop' : 'wait'}`}>{RECEPTION_EXTERNAL_STATE_LABELS[w.status]}</span>
              <span>ارسال {day(w.sentAt)}</span>{w.doneAt && <span>انجام {day(w.doneAt)}</span>}
              {w.amountRial != null && <span>{rial(w.amountRial)}</span>}
              {w.invoices.map((f) => <a key={f.id} href={`/api/v1/reception/invoices/${f.id}`} className="m-tag mute"><AppIcon name="receipt" />فاکتور</a>)}
              {w.cancelReason && <span>علت لغو: {w.cancelReason}</span>}
            </span>
            {w.note && <span className="xs muted">{w.note}</span>}
            {allowed && w.status !== 'cancelled' && <span className="row no-print">
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => edit(w)}>ویرایش</button>
              <label className="btn btn-sm">فاکتور<input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(w, f); }} /></label>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setCancel(w); setReason(''); }}>لغو</button>
            </span>}
          </li>))}</ul>}
      </div>
      <Dialog open={!!cancel} title="لغو کار خارج از نمایندگی" onClose={() => setCancel(null)}
        footer={<><button type="button" className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => void run(`/reception/external-work/${cancel!.id}/cancel`, { expectedVersion: cancel!.version, reason: reason.trim() }, 'کار بیرون لغو شد').then((ok) => ok && setCancel(null))}>لغو کار</button><button type="button" className="btn btn-ghost" onClick={() => setCancel(null)}>بازگشت</button></>}>
        <p className="small">کار لغوشده پاک نمی‌شود و با علت در تاریخچه می‌ماند.</p>
        <label className="field"><span>علت لغو</span><input className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </Dialog>
    </section>
  );
}

/** «یادداشت‌های پذیرش»: free text of the staff, kept with author and time. */
function NotesSection({ r, onSaved }: { r: ReceptionDetail; onSaved: (d: ReceptionDetail) => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [text, setText] = useState(''), [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try { onSaved(await api<ReceptionDetail>(`/reception/${r.id}/notes`, { body: { text: text.trim() } })); setText(''); toast('یادداشت ثبت شد'); }
    catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  }
  return (
    <section className="panel rcp-sec" aria-labelledby="rcp-notes">
      <div className="panel-head"><h2 id="rcp-notes">یادداشت‌های پذیرش</h2></div>
      <div className="panel-body stack">
        {can('reception.external_work') && <div className="row rcp-note-form"><label className="field"><span className="sr-only">یادداشت تازه</span><textarea className="input" rows={2} maxLength={2000} placeholder="یادداشت برای همکاران…" value={text} onChange={(e) => setText(e.target.value)} /></label><button type="button" className="btn btn-primary" disabled={busy || text.trim().length < 2} onClick={() => void add()}>ثبت یادداشت</button></div>}
        {!r.notes.length ? <p className="m-empty">یادداشتی ثبت نشده است.</p> : <ul className="rcp-lines">{r.notes.map((n) => <li key={n.id}><span style={{ whiteSpace: 'pre-line' }}>{n.text}</span><span className="xs muted">{n.createdByName ?? '—'} · {day(n.createdAt)}</span></li>)}</ul>}
      </div>
    </section>
  );
}
