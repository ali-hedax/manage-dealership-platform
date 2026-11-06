'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import {
  EXTERNAL_STATUS_LABELS, type CaseDetail, type Contractor, type Department, type ExternalWork,
  type PartsOperationsNotice, type PartsStatement, type StatementLine,
} from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali, parseRials, rial } from '@/lib/format';
import { JalaliInput } from './JalaliInput';
import { Plate } from './Plate';

export function PartsOperationNotices({ parts = false }: { parts?: boolean }) {
  const { can } = useAuth();
  const endpoint = parts ? '/parts/workbench/notices' : '/parts/operations/notices';
  const { data } = useSWR<PartsOperationsNotice[]>(can(parts ? 'part.manage' : 'case.update') ? endpoint : null, fetcher, { refreshInterval: 30_000 });
  if (!data?.length) return null;
  return <section className="stack" aria-label="پیگیری قطعات">
    {data.map(item => <Link className="callout callout-amber row" href={`/cases/${item.caseId}#case-parts`} key={item.key}>
      <Plate value={item.plate ?? ''}/><span>{item.message} · <bdi>{item.caseNumber}</bdi></span>
    </Link>)}
  </section>;
}

export function ExternalWorkPanel({ kase, queue, onChange }: { kase?: CaseDetail; queue?: boolean; onChange?: () => void }) {
  const { can, me } = useAuth();
  const [create, setCreate] = useState(false);
  const endpoint = queue ? '/parts/external-work' : `/cases/${kase?.id}/external-work`;
  const { data, error, mutate } = useSWR<ExternalWork[]>(endpoint, fetcher, { refreshInterval: queue ? 30_000 : 0 });
  const contractorsAllowed = can('part.manage');
  const { data: contractors, mutate: refreshContractors } = useSWR<Contractor[]>(contractorsAllowed ? '/parts/contractors?all=1' : null, fetcher);
  const manageList = can('settings.manage') && (me.isOwner || me.roles.includes('system_admin'));
  const jobs = (data ?? []).filter(j => !queue || !['approved', 'done'].includes(j.status)).sort((a, b) => Number(b.overdue) - Number(a.overdue));
  const refresh = () => { void mutate(); onChange?.(); };
  return <section className="panel">
    <div className="panel-head"><h2>کار بیرون از نمایندگی</h2>{kase?.status === 'open' && can('task.manage')
      && <button className="btn" onClick={() => setCreate(!create)} aria-expanded={create}>افزودن خدمات بیرون</button>}</div>
    <div className="panel-body stack">
      {error && <p role="alert">{errorMessage(error)}</p>}
      {kase && create && <ExternalCreate kase={kase} done={() => { setCreate(false); refresh(); }}/>}
      {jobs.length === 0 && data && <p className="muted small">کار بیرون در این صف نیست.</p>}
      {jobs.map(j => <ExternalRow key={`${j.id}:${j.version}:${j.taskVersion}`} job={j} contractors={contractors ?? []}
        manage={contractorsAllowed && (!kase || kase.status === 'open')} approve={!queue && kase?.status === 'open' && can('task.approve')} done={refresh}/>)}
      {queue && manageList && <details className="compact-disclosure">
        <summary>مدیریت فهرست پیمانکاران</summary>
        <div className="stack">
          {(contractors ?? []).map(c => <ContractorForm key={`${c.id}:${c.version}`} item={c} done={() => void refreshContractors()}/>)}
          <ContractorForm done={() => void refreshContractors()}/>
        </div>
      </details>}
    </div>
  </section>;
}

function ExternalCreate({ kase, done }: { kase: CaseDetail; done: () => void }) {
  const { data: departments } = useSWR<Department[]>('/departments', fetcher);
  const [start, setStart] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError('');
    const d = new FormData(e.currentTarget);
    try {
      await api(`/cases/${kase.id}/external-work`, { body: { title: d.get('title'), departmentId: d.get('department'),
        durationDays: parseRials(d.get('days')), dependsOn: d.getAll('dependsOn'), plannedStartAt: start ?? undefined } });
      done();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={submit}>
    <label className="field">شرح خدمات بیرون<input className="input" name="title" maxLength={160} required/></label>
    <label className="field">واحد مرتبط<select className="input" name="department" required>
      <option value="">انتخاب کنید</option>{departments?.filter(d => d.isActive).map(d => <option value={d.id} key={d.id}>{d.name}</option>)}
    </select></label>
    <label className="field">مدت (روز کاری)<input className="input" name="days" inputMode="decimal" required/></label>
    <JalaliInput label="شروع برنامه‌ای، در صورت نیاز" value={start} onChange={setStart} withTime/>
    {!!kase.tasks.length && <fieldset><legend>پس از تأیید این کارها</legend>{kase.tasks.map(t =>
      <label key={t.id} className="row"><input type="checkbox" name="dependsOn" value={t.id}/>{t.title ?? t.department.name}</label>)}</fieldset>}
    {error && <p role="alert" className="callout callout-red">{error}</p>}
    <button className="btn btn-primary" disabled={busy}>ثبت مرحله در مسیر تعمیرات</button>
  </form>;
}

function ExternalRow({ job, contractors, manage, approve, done }: {
  job: ExternalWork; contractors: Contractor[]; manage: boolean; approve: boolean; done: () => void;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [appointmentAt, setAppointment] = useState(job.appointmentAt), [promisedAt, setPromise] = useState(job.promisedAt);
  const endpoint = `/parts/external-work/${job.id}/actions`;
  async function act(path: string, body: object) {
    setBusy(true);setError('');
    try { await api(path, { body });setOpen(false);done(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  function coordinate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void act(endpoint, { action: 'coordinate', expectedVersion: job.version, contractorId: d.get('contractor'),
      mode: d.get('mode'), appointmentAt, promisedAt, priceRial: parseRials(d.get('price')) });
  }
  return <article className="parts-workbench-line">
    <div className="parts-workbench-line-main"><strong>{job.title}</strong><span className={`chip${job.overdue ? ' chip-red' : ''}`}>
      {job.overdue ? 'وعدهٔ برگشت گذشته' : EXTERNAL_STATUS_LABELS[job.status]}</span></div>
    <p className="muted small"><Link href={`/cases/${job.caseId}#case-tasks`}>{job.caseNumber}</Link>
      {job.contractorName && ` · ${job.contractorName}`}{job.promisedAt && ` · وعده ${formatJalali(job.promisedAt, { time: true })}`}
      {job.priceRial !== null && ` · ${rial(job.priceRial)}`}</p>
    {error && <p role="alert" className="callout callout-red">{error}</p>}
    <div className="row">
      {manage && ['pending', 'coordinated'].includes(job.status) && <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{job.status === 'pending' ? 'ثبت هماهنگی' : 'ویرایش هماهنگی'}</button>}
      {manage && ['coordinated', 'dispatched'].includes(job.status) && <button className="btn btn-primary" disabled={busy}
        onClick={() => void act(endpoint, { action: job.status === 'coordinated' ? 'dispatch' : 'complete', expectedVersion: job.version, expectedTaskVersion: job.taskVersion })}>
        {job.status === 'dispatched' ? 'انجام شد' : job.mode === 'send' ? 'ارسال شد' : 'پیمانکار آمد'}</button>}
      {approve && job.status === 'done' && <button className="btn btn-primary" disabled={busy}
        onClick={() => void act(`/tasks/${job.id}/actions`, { action: 'approve', expectedVersion: job.taskVersion })}>تأیید کار بیرون</button>}
    </div>
    {open && <form className="stack" onSubmit={coordinate}>
      <label className="field">پیمانکار<select className="input" name="contractor" defaultValue={job.contractorId ?? ''} required>
        <option value="">انتخاب کنید</option>{contractors.filter(c => c.active).map(c => <option value={c.id} key={c.id}>{c.name} · {c.specialty} · {c.phone}</option>)}
      </select></label>
      <label className="field">نوع مراجعه<select className="input" name="mode" defaultValue={job.mode ?? 'send'}><option value="send">قطعه بیرون می‌رود</option><option value="visit">پیمانکار به نمایندگی می‌آید</option></select></label>
      <JalaliInput label="تاریخ ارسال یا حضور" value={appointmentAt} onChange={setAppointment} withTime required/>
      <JalaliInput label="وعدهٔ برگشت" value={promisedAt} onChange={setPromise} withTime required/>
      <label className="field">مبلغ (ریال)<input className="input" name="price" inputMode="numeric" defaultValue={job.priceRial ?? ''} required/></label>
      <button className="btn btn-primary" disabled={busy || !appointmentAt || !promisedAt}>ذخیره هماهنگی</button>
    </form>}
  </article>;
}

function ContractorForm({ item, done }: { item?: Contractor; done: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError('');
    const form = e.currentTarget, d = new FormData(form);
    try {
      await api(item ? `/parts/contractors/${item.id}` : '/parts/contractors', { method: item ? 'PATCH' : 'POST', body: {
        name: d.get('name'), phone: d.get('phone'), specialty: d.get('specialty'), active: d.has('active'), expectedVersion: item?.version,
      } });
      if (!item) form.reset();
      done();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={submit}>
    <label className="field">نام پیمانکار<input className="input" name="name" defaultValue={item?.name} maxLength={120} required/></label>
    <label className="field">تلفن<input className="input" name="phone" defaultValue={item?.phone} type="tel" maxLength={32} required/></label>
    <label className="field">تخصص<input className="input" name="specialty" defaultValue={item?.specialty} maxLength={120} required/></label>
    <label><input type="checkbox" name="active" defaultChecked={item?.active ?? true}/> فعال</label>
    {error && <p role="alert" className="callout callout-red">{error}</p>}
    <button className="btn" disabled={busy}>{item ? 'ذخیره پیمانکار' : 'افزودن پیمانکار'}</button>
  </form>;
}

export function PartsStatementPanel({ kase }: { kase: CaseDetail }) {
  const { can } = useAuth();
  const endpoint = `/cases/${kase.id}/parts-statement`;
  const { data, error, mutate } = useSWR<PartsStatement>(endpoint, fetcher, { refreshInterval: 30_000 });
  const [assessment, setAssessment] = useState(false), [version, setVersion] = useState(0);
  const [failure, setFailure] = useState(''), [busy, setBusy] = useState(false);
  async function save(path: string, body: object) {
    setBusy(true);setFailure('');
    try { await api(path, { body });await mutate(); }
    catch (e) { setFailure(errorMessage(e)); } finally { setBusy(false); }
  }
  const selected = data?.versions.find(v => v.number === version);
  const snapshot = selected?.snapshot ?? data?.live;
  const manage = can('part.manage') && kase.status === 'open';
  const url = (format: string) => `/api/v1${endpoint}/export?format=${format}&assessment=${assessment ? '1' : '0'}${version ? `&version=${version}` : ''}`;
  return <section className="panel" aria-label="صورت قطعات">
    <div className="panel-head"><h2>صورت قطعات</h2></div>
    <div className="panel-body stack">
      {(error || failure) && <p role="alert" className="callout callout-red">{failure || errorMessage(error)}</p>}
      {data && snapshot && <>
        <label className="field">نسخهٔ صورت قطعات<select className="input" value={version} onChange={e => setVersion(Number(e.target.value))}>
          <option value={0}>صورت زنده</option>{data.versions.map(v => <option key={v.number} value={v.number}>نسخهٔ {faNum(v.number)} · {formatJalali(v.sentAt)}</option>)}</select></label>
        <label><input type="checkbox" checked={assessment} onChange={e => setAssessment(e.target.checked)}/> نمایش مبلغ کارشناسی کنار قیمت</label>
        {selected && selected.number > 1 && <p className="callout">اضافه شده {selected.added.join('، ') || '—'} · حذف شده {selected.removed.join('، ') || '—'} · تغییر کرده {selected.changed.join('، ') || '—'}</p>}
        <StatementRows rows={snapshot.parts} assessment={assessment}/>
        {!!snapshot.external.length && <><h3>کار بیرون از نمایندگی</h3><StatementRows rows={snapshot.external} assessment={false}/></>}
        {manage && !selected && data.unconfirmed.map(p => <ConsumptionForm key={`${p.id}:${p.version}`} part={p} busy={busy}
          consume={price => void save(`${endpoint}/${p.id}/consume`, { expectedVersion: p.version, salePriceRial: price })}
          undo={reason => void save(`/parts/workbench/${p.id}/actions`, { action: 'return', expectedVersion: p.version, reason })}/>)}
        {manage && !selected && data.consumed.map(p => <ConsumptionForm key={`consumed-${p.id}:${p.version}`} part={p} confirmed busy={busy}
          consume={price => void save(`${endpoint}/${p.id}/consume`, { expectedVersion: p.version, salePriceRial: price })}
          undo={reason => void save(`/parts/workbench/${p.id}/actions`, { action: 'return', expectedVersion: p.version, reason })}/>)}
        <div className="row">
          <a className="btn" href={url('pdf')}>PDF فارسی</a><a className="btn" href={url('xlsx')}>Excel</a>
          {manage && !selected && data.readyToSend && <button className="btn btn-primary" disabled={busy}
            onClick={() => void save(endpoint, { expectedVersion: data.versions.at(-1)?.number ?? 0 })}>نهایی و ارسال</button>}
        </div>
      </>}
    </div>
  </section>;
}

function ConsumptionForm({ part, busy, consume, undo, confirmed = false }: {
  part: PartsStatement['unconfirmed'][number]; confirmed?: boolean; busy: boolean; consume: (price?: number) => void; undo: (reason: string) => void;
}) {
  return <details className="compact-disclosure">
    <summary className={part.priceRial === null ? 'callout callout-red' : ''}>{part.description} · {confirmed ? 'ویرایش قلم مصرف‌شده' : 'مصرف تأیید نشده'}{part.priceRial === null ? ' · قیمت فروش ثبت نشده' : ''}</summary>
    <form className="stack" onSubmit={e => { e.preventDefault();consume(parseRials(new FormData(e.currentTarget).get('price'))); }}>
      <label className="field">قیمت فروش (ریال)<input name="price" className="input" inputMode="numeric" defaultValue={part.priceRial ?? ''} required/></label>
      <button className="btn" disabled={busy}>{confirmed ? 'اصلاح قیمت فروش' : 'تأیید مصرف'}</button>
    </form>
    <form className="stack" onSubmit={e => { e.preventDefault();undo(String(new FormData(e.currentTarget).get('reason') ?? '')); }}>
      <label className="field">دلیل برگشت<input name="reason" className="input" maxLength={300} required/></label>
      <button className="btn" disabled={busy}>ثبت برگشت</button>
    </form>
  </details>;
}

function StatementRows({ rows, assessment }: { rows: StatementLine[]; assessment: boolean }) {
  if (!rows.length) return <p className="muted small">هنوز ردیفی ثبت نشده است.</p>;
  return <div className="table-scroll"><table className="table">
    <thead><tr><th>ردیف</th><th>کد فنی</th><th>شرح</th><th>تعداد</th><th>منبع</th><th>قیمت واحد</th><th>مبلغ</th><th>مرجع</th>{assessment && <th>کارشناسی واحد</th>}</tr></thead>
    <tbody>{rows.map((p, i) => <tr key={p.id}>
      <td>{faNum(i + 1)}</td><td><bdi>{p.code ?? '—'}</bdi></td><td>{p.description}</td><td>{faNum(p.quantity)}</td><td>{p.source}</td>
      <td>{p.priceRial === null ? <span className="chip chip-red">قیمت ثبت نشده</span> : rial(p.priceRial)}</td>
      <td>{p.priceRial === null ? '—' : rial(p.priceRial * p.quantity)}</td><td><bdi>{p.reference ?? '—'}</bdi></td>
      {assessment && <td>{p.assessmentRial === null ? '—' : rial(p.assessmentRial)}</td>}</tr>)}</tbody>
  </table></div>;
}
