'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import {
  NIGHT_LIST_REASONS, NIGHT_LIST_REASON_LABELS, NIGHT_LIST_STATUS_LABELS, formatJalali, toPersianDigits,
  type NightListPending, type NightListReason, type NightListRow, type NightListView,
} from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { AppIcon } from './AppIcon';
import { EmptyState } from './EmptyState';
import { JalaliInput } from './JalaliInput';
import { Plate } from './Plate';

// «لیست شب» (reconstruction scenario, owner 2026-11-25): Manage builds it half an hour before the end
// of the working day (18:00, or 12:30 on a half-day Thursday) from the open receptions; the
// receptionist only picks the stay reason (and stations while کسب‌وکار has no technician data); the
// supervisor sends it within 15 minutes after closing. Past lists stay and are browsed with
// «لیست قبل / بعد». Print gives the PDF; Excel comes from the API.
/** «۱۸:۴۵» from an ISO time, on the Tehran clock. */
const clock = (iso: string) => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' });

type Data = NightListView | NightListPending;
const isList = (d: Data | undefined): d is NightListView => !!d && d.status !== 'not_generated';

export function NightList() {
  const { can, me } = useAuth();
  const router = useRouter();
  const day = useSearchParams().get('day') ?? undefined;
  const active = me.modules.some((m) => m.key === 'reception' && m.status === 'active');
  const key = ['/reception/night-list', day ?? ''] as const;
  const { data, error, mutate } = useSWR<Data>(can('reception.read') && active ? key : null, () => api<Data>('/reception/night-list', { body: day ? { day } : {} }), { refreshInterval: 60_000 });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [lookup, setLookup] = useState<string | null>(null);
  if (!can('reception.read')) return <EmptyState icon="lock" title="لیست شب" heading="h1">برای این بخش مجوز ندارید.</EmptyState>;
  if (!active) return <EmptyState icon="file" title="لیست شب" heading="h1" action={{ href: '/modules/reception', label: 'نقشهٔ راه' }}>این بخش هنوز روی این سرور فعال نشده است.</EmptyState>;
  const run = async (fn: () => Promise<Data>, done: string) => {
    setBusy(true);
    setMessage('');
    try {
      await mutate(await fn(), { revalidate: false });
      setMessage(done);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const editable = isList(data) && data.status === 'draft' && can('reception.night_list');
  return (
    <section className="desk rcp-desk night-desk" aria-labelledby="night-title">
      <header className="desk-head">
        <div className="desk-hello">
          <h1 id="night-title">لیست شب</h1>
          <p className="desk-sub">{data ? `${formatJalali(data.day + 'T12:00:00Z')}${isList(data) ? ` · ${NIGHT_LIST_STATUS_LABELS[data.status]}` : ''}` : 'در حال خواندن…'}</p>
          <Link className="no-print" href="/reception/stoppage">خودروهای متوقف (گزارش توقف رسمی)</Link>
        </div>
        {data && (
          <nav className="row no-print night-nav" aria-label="لیست شب روزهای دیگر">
            {data.previousDay ? <Link className="btn btn-sm" href={`/reception/night?day=${data.previousDay}`}>→ لیست قبل ({formatJalali(data.previousDay + 'T12:00:00Z')})</Link> : <span className="btn btn-sm" aria-disabled="true">لیست قبلی نیست</span>}
            {day && <Link className="btn btn-sm" href="/reception/night">امروز</Link>}
            {data.nextDay && <Link className="btn btn-sm" href={`/reception/night?day=${data.nextDay}`}>لیست بعد ({formatJalali(data.nextDay + 'T12:00:00Z')}) ←</Link>}
          </nav>
        )}
        {isList(data) && (
          <div className="row no-print">
            <button type="button" className="btn btn-sm" onClick={() => window.print()}><AppIcon name="file" /> چاپ / PDF</button>
            <a className="btn btn-sm" href={`/api/v1/reception/night-list/${data.id}/excel`}>Excel</a>
          </div>
        )}
      </header>
      <form className="row no-print" onSubmit={(e) => {
        e.preventDefault();
        if (lookup) router.push(`/reception/night?day=${lookup.slice(0, 10)}`);
      }}>
        <JalaliInput label="تاریخ لیست شب" value={lookup} onChange={setLookup} required />
        <button className="btn btn-sm" type="submit" disabled={!lookup}>یافتن لیست</button>
      </form>
      {can('integration.manage') && <LabourReview />}
      {can('settings.manage') && <LabourCatalogUpload onImported={() => { void mutate(); }} />}
      {error && <p role="alert" className="m-error">{errorMessage(error)}</p>}
      {data && !isList(data) && (
        <div className="callout">
          <p>{data.workingDay ? `لیست ${day ? 'این روز' : 'امروز'} ساعت ${clock(data.generatesAt)} از پذیرش‌های باز ساخته می‌شود.` : `${day ? 'این روز' : 'امروز'} روز کاری نیست و لیست شب ساخته نمی‌شود.`}</p>
          {data.workingDay && can('reception.night_list_send') && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run(() => api<Data>('/reception/night-list/generate', { body: day ? { day } : {} }), 'پیش‌نویس ساخته شد.')}>ساخت پیش‌نویس همین حالا</button>}
        </div>
      )}
      {isList(data) && (
        <>
          {data.historicalIncomplete ? <p className="callout warn" role="status">داده‌ی تاریخی ناقص</p>
            : <p className="small">{faNum(data.physicalVehicleCount ?? 0)} خودروی متمایز بر اساس شناسایی · {faNum(data.rows.length)} کارت پذیرش</p>}
          <div className={`callout${data.late ? ' warn' : ''}`} role="status">
            {data.status === 'sent'
              ? <span>ارسال‌شده {data.sentAt ? formatJalali(data.sentAt, { time: true }) : ''}{data.sentByName ? ` توسط ${data.sentByName}` : ''}</span>
              : <span>{data.late ? `مهلت ارسال (ساعت ${clock(data.deadline)}) گذشته است.` : `مهلت ارسال: ساعت ${clock(data.deadline)}.`}</span>}
            {data.missingReasons > 0 && <span> {faNum(data.missingReasons)} خودرو هنوز علت ماندن ندارد.</span>}
            {data.unmatchedLabourCount != null && <span> · {faNum(data.unmatchedLabourCount)} ردیف با کد اجرت ناشناخته</span>}
            {data.status === 'draft' && can('reception.night_list_send') && (
              <div className="row no-print">
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run(() => api<Data>('/reception/night-list/generate', { body: { day: data.day } }), 'پیش‌نویس بازتطبیق شد.')}>بازتطبیق پیش‌نویس</button>
                <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => api<Data>(`/reception/night-list/${data.id}/send`, { body: { expectedVersion: data.version } }), 'لیست شب ارسال شد.')}>تأیید و ارسال لیست</button>
              </div>
            )}
          </div>
          {data.status === 'draft' && can('reception.night_list_send') && <PresenceForm busy={busy} onSave={(body) => run(
            () => api<Data>(`/reception/night-list/${data.id}/presence`, { body: { ...body, expectedVersion: data.version } }),
            'اصلاح حضور ثبت شد.',
          )} />}
          {!!data.excluded.length && <details className="callout no-print">
            <summary>{faNum(data.excluded.length)} کارت کنارگذاشته‌شده از پیش‌نویس</summary>
            <ul>{data.excluded.map((r) => <li key={r.id}>
              <Link href={`/reception/${r.receptionId}`}>پذیرش <bdi>{r.admissionNo ?? 'نامشخص'}</bdi></Link>
              {' · '}{r.correction?.reason ?? 'خارج از شرایط زمان ساخت لیست'}
              {r.reason ? ` · یادداشت ماندن: ${NIGHT_LIST_REASON_LABELS[r.reason]}` : ''}
            </li>)}</ul>
          </details>}
          {!data.rows.length && !data.historicalIncomplete && <p className="m-empty">خودرویی در این لیست ثبت نشده است.</p>}
          {!!data.rows.length && (
            <div className="table-scroll">
              <table className="table static night-table" data-testid="night-list">
                <thead><tr><th scope="col">خودرو</th><th scope="col">مالک</th><th scope="col">پذیرش</th><th scope="col">روز</th><th scope="col">نام اجرت</th><th scope="col">جایگاه فعلی</th><th scope="col">جایگاه‌های بعدی</th><th scope="col">علت ماندن</th></tr></thead>
                <tbody>{data.rows.map((r) => <NightRow key={`${r.id}:${r.version}`} row={r} editable={editable} busy={busy} onSave={(body) => run(() => api<Data>(`/reception/night-list/items/${r.id}`, { body }), 'ذخیره شد.')} />)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
      {message && <p className="small" role="status">{message}</p>}
    </section>
  );
}

function LabourCatalogUpload({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const { data, error, mutate } = useSWR<{ count: number; version: number }>(open ? '/reception/labour-catalog' : null, fetcher);
  return <details className="callout no-print" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary id="labour-catalog-title">مرجع کد و نام اجرت</summary>
    <p id="labour-catalog-help">فایل CSV با کدگذاری UTF-8 و ستون‌های <bdi>code,name</bdi> را انتخاب کنید. ستون کد را متنی نگه دارید تا صفرهای ابتدایی حفظ شوند. بارگذاری، تمام فهرست فعلی را جایگزین می‌کند.</p>
    {error && <p role="alert" className="m-error">{errorMessage(error)}</p>}
    {data && <p>{faNum(data.count)} کد در مرجع نمایندگی ثبت شده است.</p>}
    <form className="row" aria-labelledby="labour-catalog-title" onSubmit={async (e) => {
      e.preventDefault();
      if (!data || busy) return;
      const form = e.currentTarget;
      const file = new FormData(form).get('catalog');
      if (!(file instanceof File) || !file.size) return;
      setFailure('');
      setMessage('');
      if (file.size > 3_000_000) {
        setFailure('حجم فایل CSV باید حداکثر سه مگابایت باشد.');
        return;
      }
      setBusy(true);
      try {
        const csv = await file.text();
        if (csv.length > 1_000_000) {
          setFailure('فایل CSV بیش از یک میلیون نویسه دارد.');
          return;
        }
        const result = await api<{ count: number; version: number }>('/reception/labour-catalog', {
          body: { csv, expectedVersion: data.version },
        });
        await mutate(result, { revalidate: false });
        form.reset();
        setMessage(`${faNum(result.count)} کد اجرت ثبت شد.`);
        onImported();
      } catch (e) {
        setFailure(errorMessage(e));
        void mutate();
      } finally {
        setBusy(false);
      }
    }}>
      <label htmlFor="labour-catalog-file">فایل کد و نام اجرت</label>
      <input id="labour-catalog-file" name="catalog" type="file" accept=".csv,text/csv" required
        aria-describedby={failure ? 'labour-catalog-help labour-catalog-error' : 'labour-catalog-help'}
        aria-invalid={!!failure} disabled={busy} onChange={() => { setFailure(''); setMessage(''); }} />
      <button type="submit" className="btn btn-sm" disabled={busy || !data}>{busy ? 'در حال بارگذاری…' : 'جایگزینی مرجع اجرت'}</button>
    </form>
    {failure && <p id="labour-catalog-error" role="alert" className="m-error">{failure}</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}

function LabourReview() {
  const [open, setOpen] = useState(false);
  const { data, error } = useSWR<{ rows: { id: string; receptionId: string; admissionNo: string | null; lineId: string }[]; more: boolean }>(
    open ? '/reception/labour-review' : null,
    fetcher,
  );
  return <details className="callout no-print" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>صف بررسی توضیح اجرت در کسب‌وکار</summary>
    {error && <p role="alert" className="m-error">{errorMessage(error)}</p>}
    {!data && !error && <p role="status">در حال خواندن…</p>}
    {data && (data.rows.length ? <ul>{data.rows.map((r) => <li key={r.id}>
      <Link href={`/reception/${r.receptionId}`}>پذیرش <bdi>{r.admissionNo ?? 'نامشخص'}</bdi></Link> · ردیف <bdi>{r.lineId}</bdi>
    </li>)}</ul> : <p>اجرت بدون نام برای بررسی وجود ندارد.</p>)}
    {data?.more && <p>۲۰۰ ردیف اخیر نمایش داده شده است.</p>}
  </details>;
}

function PresenceForm({ busy, onSave }: { busy: boolean; onSave: (body: { admissionNo: string; present: boolean; reason: string }) => void }) {
  const [admissionNo, setAdmissionNo] = useState('');
  const [present, setPresent] = useState(true);
  const [reason, setReason] = useState('');
  return <details className="callout no-print">
    <summary>اصلاح حضور خودرو</summary>
    <form className="row" onSubmit={(e) => {
      e.preventDefault();
      if (admissionNo.trim() && reason.trim()) onSave({ admissionNo: admissionNo.trim(), present, reason: reason.trim() });
    }}>
      <label className="field"><span>شمارهٔ پذیرش</span><input className="input" required maxLength={80} value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} /></label>
      <label className="field"><span>وضعیت در محوطه</span><select className="input" value={String(present)} onChange={(e) => setPresent(e.target.value === 'true')}>
        <option value="true">خودرو حضور دارد</option><option value="false">خودرو حضور ندارد</option>
      </select></label>
      <label className="field"><span>دلیل اصلاح</span><input className="input" required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <button type="submit" className="btn btn-sm" disabled={busy || !admissionNo.trim() || !reason.trim()}>ثبت اصلاح</button>
    </form>
  </details>;
}

function NightRow({ row: r, editable, busy, onSave }: { row: NightListRow; editable: boolean; busy: boolean; onSave: (body: object) => void }) {
  const [reason, setReason] = useState<NightListReason | ''>(r.reason ?? ''), [note, setNote] = useState(r.reasonNote ?? '');
  const [current, setCurrent] = useState(r.currentStation ?? ''), [next, setNext] = useState(r.nextStations ?? '');
  const changed = reason !== (r.reason ?? '') || note !== (r.reasonNote ?? '') || current !== (r.currentStation ?? '') || next !== (r.nextStations ?? '');
  const save = () => onSave({ expectedVersion: r.version, reason: reason || null, ...(note.trim() ? { reasonNote: note.trim() } : {}), ...(current.trim() ? { currentStation: current.trim() } : {}), ...(next.trim() ? { nextStations: next.trim() } : {}) });
  return (
    <tr className={r.isOpen ? '' : 'is-closed'}>
      <td><Link href={`/reception/${r.receptionId}`} className="night-car"><Plate value={r.plate} /><span>{r.vehicleName ?? 'خودرو'}</span></Link>{r.accident && <span className="m-tag wait">تصادفی</span>}{!r.isOpen && <span className="m-tag ok">ترخیص شد</span>}</td>
      <td data-label="مالک">{r.ownerName ?? '—'}</td>
      <td data-label="پذیرش"><bdi>{r.admissionNo ? toPersianDigits(r.admissionNo) : '—'}</bdi></td>
      <td data-label="روز">{r.daysIn == null ? '—' : faNum(r.daysIn)}{r.daysIn === 2 && <div className="small">مانده از دیروز</div>}{r.daysIn === 3 && <div className="small">مانده از پریروز</div>}</td>
      <td data-label="نام اجرت" className="small">{r.labour.length ? r.labour.join(' · ') : '—'}</td>
      <td data-label="جایگاه فعلی">{editable ? <input className="input" aria-label="جایگاه فعلی" maxLength={60} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="مثلاً باتری‌سازی ۳۶" /> : r.currentStation ?? '—'}</td>
      <td data-label="جایگاه‌های بعدی">{editable ? <input className="input" aria-label="جایگاه‌های بعدی" maxLength={120} value={next} onChange={(e) => setNext(e.target.value)} placeholder="مثلاً مکانیکی ۹۹" /> : r.nextStations ?? '—'}</td>
      <td data-label="علت ماندن">
        {r.correction && <p className="small">اصلاح حضور: {r.correction.reason}</p>}
        {editable ? (
          <div className="stack night-reason">
            <select className="input" aria-label="علت ماندن" value={reason} onChange={(e) => setReason(e.target.value as NightListReason | '')}>
              <option value="">— انتخاب علت —</option>
              {NIGHT_LIST_REASONS.map((k) => <option key={k} value={k}>{NIGHT_LIST_REASON_LABELS[k]}</option>)}
            </select>
            {reason === 'other' && <input className="input" aria-label="توضیح علت" maxLength={300} required value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح کوتاه" />}
            {r.carried && !changed && <span className="muted small">از لیست دیروز</span>}
            {(changed || r.carried) && <button type="button" className="btn btn-sm no-print" disabled={busy || (reason === 'other' && !note.trim())} onClick={save}>{changed ? 'ذخیره' : 'تأیید'}</button>}
          </div>
        ) : (
          <span>{r.reason ? NIGHT_LIST_REASON_LABELS[r.reason] : 'ثبت نشده'}{r.reasonNote ? ` — ${r.reasonNote}` : ''}{r.carried ? ' (از دیروز)' : ''}</span>
        )}
      </td>
    </tr>
  );
}
