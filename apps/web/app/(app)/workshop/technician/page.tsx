'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { TECHNICIAN_PRIORITY_LABELS, TECHNICIAN_PROBLEMS, TECHNICIAN_PROBLEM_LABELS, blockersOf, technicianDue, type TechnicianProblem, type WorkflowBlocker, type WorkshopTask } from '@manage/shared';
import { useAuth } from '@/lib/auth';
import { ApiError, api, errorMessage, fetcher } from '@/lib/api';
import { faNum, formatJalali, toPersianDigits } from '@/lib/format';
import { Plate, PlateText } from '@/components/Plate';
import { Dialog } from '@/components/Dialog';
import { ReminderCards } from '@/components/ReminderCards';
import { WorkflowBlockerDialog } from '@/components/WorkflowBlockerDialog';

// Technician desk (spec §9, mockup Technician.dc.html; owner 2026-11-27): each job shows only the
// plate, the short vehicle name, the priority and the deadline in days, with one big button that
// changes «شروع کار» → «پایان کار» → «منتظر تأیید کارشناس». No wage or any other amount is shown.
// «قطعه ندارم»، «مشکل دیگر» and «قطعه آماده است، تحویل بگیرید» stay: they are actions, not amounts.
const TONE = { urgent: 'late', today: 'soon', normal: 'ok' } as const;
const clock = (iso: string) => toPersianDigits(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tehran', hour12: false }).format(new Date(iso)));

export default function TechnicianPage() {
  const { me, can } = useAuth();
  const { data, error, mutate } = useSWR<WorkshopTask[]>(can('task.execute') ? '/workshop/my-tasks' : null, fetcher, { refreshInterval: 30000 });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failure, setFailure] = useState('');
  const [problemFor, setProblemFor] = useState<WorkshopTask | null>(null);
  // Selecting a vehicle never changes its job status or closes another active job.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // A refused «شروع کار» explains each missing prerequisite; «تلاش دوباره» repeats the same action.
  const [blocked, setBlocked] = useState<{ blockers: WorkflowBlocker[]; retry?: () => void; opener?: HTMLElement | null } | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setBusy(true); setFailure(''); setMessage('');
    try { await fn(); setMessage(done); setBlocked(null); } catch (e) {
      const list = e instanceof ApiError ? blockersOf(e.details) : [];
      if (list.length) setBlocked({ blockers: list, retry: retryRef.current ?? undefined, opener }); else setFailure(errorMessage(e));
    } finally { await mutate(); setBusy(false); }
  }
  const retryRef = useRef<(() => void) | null>(null);
  const act = (t: WorkshopTask) => {
    const start = t.status === 'pending';
    // Retry reads the newest version of the same assignment after the case was corrected.
    retryRef.current = () => { void mutate().then((list) => { const fresh = list?.find((x) => x.id === t.id); if (fresh) act(fresh); }); };
    return run(() => api(`/workshop/my-tasks/${t.id}/actions`, { body: { action: start ? 'start' : 'complete', expectedVersion: t.version } }),
      start ? 'شروع کار ثبت شد.' : 'پایان کار ثبت شد؛ منتظر تأیید کارشناس.');
  };
  const pickup = (taskId: string, partId: string, expectedVersion: number) => run(() => api(`/tasks/${taskId}/part-pickup`, { body: { partId, expectedVersion } }), 'تحویل قطعه ثبت شد.');
  /** Explanation of a blocked start; «تلاش دوباره» starts this same assignment once it is allowed. */
  const why = (t: WorkshopTask) => {
    retryRef.current = () => { void mutate().then((list) => { const fresh = list?.find((x) => x.id === t.id); if (fresh) act(fresh); }); };
    setBlocked({ blockers: t.startBlockers ?? [], retry: retryRef.current });
  };
  const report = (t: WorkshopTask, problem: TechnicianProblem) =>
    run(async () => { await api(`/workshop/my-tasks/${t.id}/problem`, { body: { problem } }); setProblemFor(null); },
      `«${TECHNICIAN_PROBLEM_LABELS[problem]}» برای کارشناس این خودرو و انباردار فرستاده شد.`);

  if (!can('task.execute')) return <p className="callout">کارتابل تعمیرکار برای شما فعال نیست.</p>;
  const open = (data ?? []).filter((t) => t.status !== 'approved');
  const current = open.find((t) => t.id === selectedTaskId) ?? open.find((t) => t.status === 'in_progress') ?? open.find((t) => t.status === 'pending' && t.canStart) ?? open.find((t) => t.status !== 'done') ?? open[0];
  const next = open.filter((t) => t.id !== current?.id);
  const place = current ? [current.departmentName, current.stationName ?? current.stationCode].filter(Boolean).join(' · ') : 'کارتابل تعمیرکار';

  return (
    <div className="tc-page">
      <header className="tc-head">
        <div>
          <h1>سلام {me.displayName}</h1>
          <p>{place} · {formatJalali(new Date())}</p>
        </div>
      </header>
      <ReminderCards compact />
      {message && <p role="status" className="m-next">{message}</p>}
      {failure && <p role="alert" className="m-error">{failure}</p>}
      {error && <p role="alert" className="m-error">کارها دریافت نشد. <button className="m-btn-s" onClick={() => void mutate()}>تلاش دوباره</button></p>}
      {!data && !error && <p className="m-empty">در حال دریافت کارها…</p>}

      {current && <CurrentJob key={current.id} t={current} busy={busy} onPause={(reason) => run(() => api(`/workshop/my-tasks/${current.id}/actions`, { body: { action: current.pauseReason ? 'resume' : 'pause', expectedVersion: current.version, note: reason } }), current.pauseReason ? 'ادامه کار ثبت شد.' : 'توقف این خودرو ثبت شد.')}  onAct={act} onPickup={pickup} onNoPart={(t) => report(t, 'no_part')} onProblem={setProblemFor} onWhy={why} />}
      <WorkflowBlockerDialog blockers={blocked?.blockers ?? null} title="شروع کار هنوز ممکن نیست" busy={busy} returnFocus={blocked?.opener ?? null} onClose={() => setBlocked(null)} onRetry={blocked?.retry ? () => { const r = blocked.retry!; setBlocked(null); r(); } : undefined} />
      {data && !open.length && <div className="tc-card tc-empty"><h2>کار بازی ندارید</h2><p>وقتی کاری به شما ارجاع شود، همین‌جا می‌آید.</p></div>}

      {next.length > 0 && (
        <section aria-label="همه خودروهای من">
          <h2 className="tc-sub">سایر خودروهای من</h2>
          <ul className="tc-next">
            {next.map((t) => {
              const due = technicianDue(t.plannedEndAt);
              return (
              <li key={t.id} className="tc-mini" data-testid="tc-job">
                <div>
                  <strong>{t.vehicleLabel}</strong>
                  <span><PlateText value={t.plate} /> · {t.title || t.departmentName}{t.status === 'done' ? ' · منتظر تأیید کارشناس' : ''}</span>
                  <span className="tc-due"><span className={`tc-pill tc-pill-${TONE[due.priority]}`}>{TECHNICIAN_PRIORITY_LABELS[due.priority]}</span> مهلت: {due.daysText}</span>
                  {t.status === 'pending' && !t.canStart && !!t.startBlockers?.length && <span className="tc-note">{t.startBlockers[0]!.message} <button type="button" className="m-btn-s" onClick={() => why(t)}>چرا و چه باید کرد؟</button></span>}
                  <button type="button" className="m-btn-s" disabled={busy} onClick={() => setSelectedTaskId(t.id)} aria-label={`باز کردن کار ${t.vehicleLabel}`}>باز کردن کار</button>
                </div>
              </li>
              );
            })}
          </ul>
        </section>
      )}
      <nav className="tc-links no-print" aria-label="کارکرد و فیدبک‌ها">
        <Link href="/reminders">فیدبک‌های من</Link>
      </nav>

      <Dialog open={!!problemFor} title="مشکل دیگر" onClose={() => !busy && setProblemFor(null)} footer={<button type="button" className="btn" disabled={busy} onClick={() => setProblemFor(null)}>انصراف</button>}>
        <p className="small">پیام برای کارشناس همین خودرو فرستاده می‌شود{problemFor?.plate ? <> (پلاک <PlateText value={problemFor.plate} />)</> : ''}.</p>
        <div className="technician-problems">
          {TECHNICIAN_PROBLEMS.map((p) => <button key={p} type="button" className="btn" disabled={busy} onClick={() => problemFor && void report(problemFor, p)}>{TECHNICIAN_PROBLEM_LABELS[p]}</button>)}
        </div>
      </Dialog>
    </div>
  );
}

function CurrentJob({ t, busy, onPause, onAct, onPickup, onNoPart, onProblem, onWhy }: {
  onPause: (reason: string) => Promise<void>;
  t: WorkshopTask; busy: boolean; onWhy: (t: WorkshopTask) => void;
  onAct: (t: WorkshopTask) => void; onPickup: (taskId: string, partId: string, v: number) => void;
  onNoPart: (t: WorkshopTask) => void; onProblem: (t: WorkshopTask) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [t.version]);
  const due = technicianDue(t.plannedEndAt);
  const waiting = t.status === 'pending' && !t.canStart;
  return (
    <article className="tc-card" aria-label="کار فعلی" data-testid="tc-job">
      <div className="tc-card-top">
        <div className="tc-vehicle">
          <strong>{t.vehicleLabel}</strong>
          <span className={`tc-pill tc-pill-${TONE[due.priority]}`} data-testid="tc-priority">{TECHNICIAN_PRIORITY_LABELS[due.priority]}</span>
        </div>
        {t.status !== 'done' && <div className={`tc-left tc-left-${TONE[due.priority]}`}><small>مهلت</small><b>{due.daysText}</b></div>}
      </div>
      <Plate value={t.plate ?? ''} large />
      <div className="tc-job-line">
        <p>{t.title || t.departmentName}</p>
      </div>

      {t.status !== 'done' && t.partsReady && t.partsReady.count > 0 && (
        <div className="tc-ready" role="status">
          <b>قطعه آماده است، تحویل بگیرید</b>
          <span>{t.partsReady.names.join('، ')}{t.partsReady.count > t.partsReady.names.length ? ' و …' : ''}</span>
          {t.partsReady.pickup?.map((p) => <button key={p.id} type="button" className="m-btn-s" disabled={busy} onClick={() => onPickup(t.id, p.id, p.version)}>گرفتم · {p.description}</button>)}
        </div>
      )}
      {t.status !== 'done' && !!t.partsWaiting && <p className="tc-note">{faNum(t.partsWaiting)} قطعهٔ دیگر هنوز نرسیده است.</p>}

      {t.status === 'pending' && (
        <button type="button" className="tc-big tc-go" disabled={busy || waiting} onClick={() => onAct(t)}>{busy ? 'در حال ثبت…' : 'شروع کار'}</button>
      )}
      {waiting && (
        <p className="tc-note">
          {t.startBlockers?.[0]?.message ?? 'پیش‌نیاز شروع این کار هنوز تکمیل نشده است.'}{' '}
          {!!t.startBlockers?.length && <button type="button" className="m-btn-s" onClick={() => onWhy(t)}>چرا و چه باید کرد؟</button>}
        </p>
      )}
      {t.status === 'in_progress' && (
        <>
          {t.actualStartAt ? <p className="tc-note">در حال کار از ساعت {clock(t.actualStartAt)}{t.workDays != null ? ` · ${toPersianDigits(t.workDays)} روز کاری` : ''}{t.delayDays ? ` · تأخیر ${toPersianDigits(t.delayDays)} روز کاری` : ''}</p> : <p className="tc-note">زمان شروع ثبت نشده</p>}
          {t.pauseReason && <p role="status">توقف موقت · {t.pauseReason}</p>}
          <label className="field">{t.pauseReason ? 'علت ادامه کار' : 'علت توقف موقت'}
            <input value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} />
          </label>
          <button type="button" className="m-btn-s" disabled={busy || !reason.trim()} onClick={() => void onPause(reason.trim())}>{t.pauseReason ? 'ادامه کار' : 'توقف موقت'}</button>
          <button type="button" className="tc-big tc-stop" disabled={busy || !!t.pauseReason} onClick={() => onAct(t)}>{busy ? 'در حال ثبت…' : 'پایان کار'}</button>
        </>
      )}
      {t.status === 'done' && <p className="tc-big tc-wait" role="status">تمام شد. منتظر تأیید کارشناس.</p>}
      {t.status === 'blocked' && <p className="tc-note">کار متوقف است؛ با کارشناس هماهنگ کنید.</p>}

      {t.status !== 'done' && (
        <div className="tc-problems">
          <button type="button" className="tc-warn" disabled={busy} onClick={() => onNoPart(t)}>قطعه ندارم</button>
          <button type="button" className="m-btn-s" disabled={busy} onClick={() => onProblem(t)} aria-label={`مشکل دیگر؛ ${t.title || t.departmentName}`}>مشکل دیگر</button>
        </div>
      )}
    </article>
  );
}
