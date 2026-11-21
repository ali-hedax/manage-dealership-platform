'use client';
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { CASE_STEPS, CASE_STEP_LABELS, type CaseWorkflow, COVERAGE_LABELS, coverageTab, type CaseDetail, type DeskFolder, type NextActor, type Task } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { AppIcon, type IconName } from './AppIcon';
import { ReminderComposer, type ReminderDefaults } from './ReminderComposer';
import { Dialog } from './Dialog';
import { Plate } from './Plate';
import { BodyBadge, CoverageBadge, HeaderClip } from './FolderParts';

// Case folder (spec §12; owner reference «پوشهٔ پرونده خودرو»): a physical folder with
// the coverage tab and a binder clip; the car, customer, plate, identifiers and days in
// the shop; the six-step journey as chevrons; folder tabs; and the role's «قدم بعدی شما».

export const CASE_TABS = ['intake', 'assessment', 'plan', 'execution', 'quality', 'completion', 'parts', 'docs', 'history'] as const;
export type CaseTab = (typeof CASE_TABS)[number];
export const CASE_TAB_LABELS: Record<CaseTab, string> = { ...CASE_STEP_LABELS, parts: 'قطعات', docs: 'مدارک', history: 'تاریخچه' };
const TAB_ICON: Record<CaseTab, IconName> = { intake: 'folder', assessment: 'clipboard', plan: 'list', execution: 'wrench', quality: 'check', completion: 'flag', parts: 'box', docs: 'doc', history: 'history' };
export const SECTION_TAB: Record<string, CaseTab> = {
  'case-intake': 'intake', 'case-plan': 'plan', 'case-tasks': 'execution', 'case-blockers': 'execution', 'case-quality': 'quality', 'case-responsibility': 'execution',
  'case-completion': 'completion', 'case-invoice': 'completion', 'case-assessment': 'assessment', 'case-parts': 'parts',
  'case-info': 'docs', 'case-finance': 'completion', 'case-provenance': 'docs', 'case-history': 'history',
};

export function myActors(roles: readonly string[]): NextActor[] {
  const out: NextActor[] = [];
  if (roles.includes('accident_expert') || roles.includes('system_admin')) out.push('accident_expert');
  if (roles.includes('parts_clerk') || roles.includes('system_admin')) out.push('parts_clerk');
  if (roles.includes('technician')) out.push('technician');
  return out;
}

/** The desk facts of one case (place, days, journey, «قدم بعدی»), shared by header and cards. */
export function useFolder(caseId: string) {
  return useSWR<DeskFolder>(`/desk/folders/${caseId}`, fetcher, { refreshInterval: 60_000 });
}

const STEP_ICON: Record<(typeof CASE_STEPS)[number], IconName> = { intake: 'check', assessment: 'doc', plan: 'list', execution: 'wrench', quality: 'shield', completion: 'car' };

/**
 * Case folder header in the approved design (owner, 2026-11-18; «Dena Plus Vehicle Case
 * Dashboard»): a cream folder with paper layers, the «پرونده خودرو» tab and the large gold
 * clip; the short vehicle name, the case's real plate, coverage and «تعویض اتاق»; the
 * journey as chevrons; and the folder tabs. `side` is the vehicle column beside it.
 */
export function CaseFolderHeader({ kase, tab, onTab, actions, chips, side, children }: { kase: CaseDetail; tab: CaseTab; onTab: (t: CaseTab, anchor?: string) => void; actions?: ReactNode; chips?: ReactNode; side?: ReactNode; children: ReactNode }) {
  const { data: f } = useFolder(kase.id);
  const cov = coverageTab(kase.coverageType);
  const { data: workflow } = useSWR<CaseWorkflow>(`/cases/${kase.id}/workflow?v=${kase.version}`, fetcher);
  const current = workflow?.current ?? 'assessment';
  const doneIdx = CASE_STEPS.indexOf(current);
  const name = f?.vehicle ?? (kase.vehicle.model || kase.vehicle.brand || kase.vehicleLabel).trim();
  return (
    <div className={`cfx${side ? ' with-side' : ''}`}>
      <div className={`cf cf2 cov-${cov.key}`}>
        <div className="cf2-folder" title={COVERAGE_LABELS[kase.coverageType]}>
          <span className="cf2-sheet s1" aria-hidden="true" />
          <span className="cf2-sheet s2" aria-hidden="true" />
          <span className="cf2-tab"><AppIcon name="folder" />پرونده خودرو</span>
          <HeaderClip />
          <header className="case-hero cf-head cf2-face" aria-label="سربرگ پرونده">
            <div className="cf2-name">
              <span className="cf2-car-ico" aria-hidden="true"><AppIcon name="car" /></span>
              <h1 className="cf-car">{name}</h1>
            </div>
            <span className="cf2-rule" aria-hidden="true" />
            <div className="cf2-plate"><Plate value={kase.vehicle.plate} size="xxl" /></div>
            <div className="cf2-badges">
              <CoverageBadge coverage={kase.coverageType} />
              {kase.bodyReplacement && <BodyBadge />}
            </div>
            <p className="cf2-meta">
              <span className="cf-cust"><AppIcon name="user" />{kase.customer?.fullName ?? 'مشتری ثبت نشده'}</span>
              <span className="cf-ids">پرونده <bdi>{toPersianDigits(kase.caseNumber)}</bdi> · پذیرش <bdi>{kase.admissionNo ? toPersianDigits(kase.admissionNo) : 'ندارد'}</bdi></span>
              {f && <span className="cf-days"><b>{faNum(f.daysInShop)}</b> روز در تعمیرگاه</span>}
              {kase.isTest && <span className="m-tag">آزمایشی</span>}
              {chips && <span className="cf2-chips">{chips}</span>}
            </p>
          </header>
        </div>
        <ol className="journey guided-journey cf2-journey" aria-label="مسیر خودرو">
          {CASE_STEPS.map((step, i) => {
            const locked = i > doneIdx;
            const reason = step === 'plan' || step === 'execution' || step === 'quality' ? workflow?.requirements[step].join('؛ ') : '';
            return <li key={step} className={`jstep ${i < doneIdx ? 'done' : i === doneIdx ? 'now' : 'next'}`} aria-current={i === doneIdx ? 'step' : undefined}>
              <button type="button" disabled={locked} aria-pressed={tab === step} onClick={() => onTab(step)} title={locked ? reason || 'ابتدا مرحلهٔ فعلی را تکمیل کنید' : undefined}>
                <AppIcon name={i < doneIdx ? 'check' : STEP_ICON[step]} />
                <span>{CASE_STEP_LABELS[step]}</span>
                {locked && <small>{reason || 'پس از تکمیل مرحلهٔ قبل'}</small>}
              </button>
              {i < CASE_STEPS.length - 1 && <span className="step-arrow" aria-hidden="true">←</span>}
            </li>;
          })}
        </ol>
        {actions && <div className="cf-status"><div className="cf-actions no-print">{actions}</div></div>}
        <div className="cf-paper cf2-body">
          <nav className="cf-tabs" role="tablist" aria-label="بخش‌های پرونده">
            {(['parts', 'docs', 'history'] as const).map((t) => (
              <button key={t} type="button" role="tab" id={`tab-${t}`} aria-controls="case-tabpanel" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => onTab(t)}>
                <AppIcon name={TAB_ICON[t]} />{CASE_TAB_LABELS[t]}
              </button>
            ))}
          </nav>
          {children}
        </div>
      </div>
      {side && <aside className="cfx-side no-print-break" aria-label="مشخصات خودرو و اقدامات">{side}</aside>}
    </div>
  );
}

const ACTOR_LABEL: Record<NextActor, string> = { accident_expert: 'کارشناس تصادفات', parts_clerk: 'مسئول قطعات', technician: 'تکنسین جایگاه', none: '' };

/** What happens after the step, and where it is done. */
export function nextStepHelp(text: string, actor: NextActor): { why: string; tab: CaseTab; anchor: string; cta: string } {
  if (text.includes('تمام شد —')) return { why: 'با تأیید شما، کار روی گوشی تکنسین بعدی ظاهر می‌شود و اجرت این قدم قطعی می‌شود.', tab: 'execution', anchor: 'case-tasks', cta: 'بررسی و تأیید' };
  if (text.startsWith('برآورد')) return { why: 'با ورود برآورد (تکی یا اکسل)، فهرست قطعات ساخته می‌شود و مسئول قطعات تعیین تکلیف می‌کند.', tab: 'assessment', anchor: 'case-assessment', cta: 'ورود برآورد کارشناسی' };
  if (text.startsWith('مسیر تعمیر')) return { why: 'قدم‌ها را به ترتیب بنویسید؛ کار هر قدم روی گوشی تکنسین همان جایگاه می‌آید.', tab: 'plan', anchor: 'case-plan', cta: 'ساخت مسیر تعمیر' };
  if (text.startsWith('آمادهٔ تحویل —')) return { why: 'هماهنگی با مشتری و ثبت مشخصات تحویل‌گیرنده در بخش تکمیل پرونده انجام می‌شود.', tab: 'completion', anchor: 'case-completion', cta: 'هماهنگی و تحویل خودرو' };
  if (text.includes('کنترل نهایی')) return { why: 'پس از کنترل نهایی و «پایان کار»، پرونده بسته می‌شود و قطعاتش دیگر از موجودی کم نمی‌شوند.', tab: 'quality', anchor: 'case-quality', cta: 'کنترل نهایی و پایان کار' };
  if (text.startsWith('تکنسین:') || text.includes('متوقف')) return { why: 'پاسخ بدهید یا علت توقف را ثبت کنید؛ مدت انتظار در اتاق کنترل دیده می‌شود.', tab: 'execution', anchor: 'case-blockers', cta: 'موانع و پیگیری' };
  if (actor === 'parts_clerk') return { why: 'هر قلم را در فهرست قطعات تعیین تکلیف کنید؛ آمادهٔ تحویل که شد، کارشناس و جایگاه خبر می‌گیرند.', tab: 'parts', anchor: 'case-parts', cta: 'فهرست قطعات' };
  if (actor === 'technician') return { why: 'این قدم را تکنسین جایگاه روی گوشی خود پیش می‌برد؛ شروع، پایان و تأخیر هر قدم در جدول «برنامهٔ تعمیرات» دیده می‌شود.', tab: 'execution', anchor: 'case-tasks', cta: 'برنامهٔ تعمیر' };
  return { why: 'برنامه و وضعیت هر قدم در جدول «برنامهٔ تعمیرات» است.', tab: 'execution', anchor: 'case-tasks', cta: 'برنامهٔ تعمیر' };
}

/** A reminder about someone else's step: the technician of the running step, the parts clerk or the case's expert. */
function nudge(kase: CaseDetail, actor: NextActor, text: string): ReminderDefaults {
  const base = { caseId: kase.id, caseLabel: kase.caseNumber, plate: kase.plate, body: `${(kase.vehicle.model || kase.vehicleLabel).trim()}: ${text}`.slice(0, 300), source: 'manual' as const };
  if (actor === 'technician') {
    const t = kase.tasks.find((x) => x.status === 'in_progress') ?? kase.tasks.find((x) => x.status === 'blocked') ?? kase.tasks.find((x) => x.status === 'pending');
    if (t?.assignedUserId) return { ...base, userIds: [t.assignedUserId] };
    return { ...base, role: 'technician' };
  }
  if (actor === 'parts_clerk') return { ...base, role: 'parts_clerk' };
  return kase.responsible ? { ...base, userIds: [kase.responsible.id] } : { ...base, role: 'accident_expert' };
}

/** «قدم بعدی شما»: one sentence, why, and the button that does it (approval opens a review dialog). */
export function NextStepCard({ kase, onTab, onChange }: { kase: CaseDetail; onTab: (t: CaseTab, anchor?: string) => void; onChange: () => void }) {
  const { me, can } = useAuth();
  const { data: f, mutate } = useFolder(kase.id);
  const [reviewing, setReviewing] = useState<Task | null>(null);
  const [remind, setRemind] = useState<ReminderDefaults | null>(null);
  if (!f || f.next.actor === 'none') return null;
  const mine = myActors(me.roles).includes(f.next.actor);
  const h = nextStepHelp(f.next.text, f.next.actor);
  const done = kase.tasks.find((t) => t.status === 'done');
  const approve = mine && !!done && h.cta === 'بررسی و تأیید' && can('task.approve');
  return (
    <section className={`cf-next tone-${f.next.tone}${mine ? ' mine' : ''}`} aria-label={mine ? 'قدم بعدی شما' : 'قدم بعدی'}>
      <span className="cf-next-k"><AppIcon name="flag" />{mine ? 'قدم بعدی شما' : `قدم بعدی · با ${ACTOR_LABEL[f.next.actor]}`}</span>
      <strong>{f.next.text}</strong>
      <p>{h.why}</p>
      {mine ? (
        <div className="cf-next-actions">
          <button type="button" className="m-btn" onClick={() => (approve ? setReviewing(done!) : onTab(h.tab, h.anchor))}>{h.cta}<AppIcon name="arrow-left" /></button>
        </div>
      ) : (
        <div className="cf-next-actions">
          <button type="button" className="m-btn2" onClick={() => setRemind(nudge(kase, f.next.actor, f.next.text))}><AppIcon name="bell" />فیدبک به {ACTOR_LABEL[f.next.actor]}</button>
        </div>
      )}
      <ReminderComposer open={!!remind} onClose={() => setRemind(null)} defaults={remind ?? undefined} />
      {reviewing && <ApproveDialog kase={kase} task={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); void mutate(); onChange(); }} />}
    </section>
  );
}

/** Spec §6: the expert approves a finished step (next step appears on the technician's phone and the wage is final) or sends it back. */
function ApproveDialog({ kase, task, onClose, onDone }: { kase: CaseDetail; task: Task; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const next = kase.tasks.find((t) => t.status === 'pending' && t.dependsOn.includes(task.id)) ?? kase.tasks.find((t) => t.status === 'pending');
  const label = task.title || task.department.name;
  async function act(action: 'approve' | 'reopen') {
    setBusy(true);
    try {
      await api(`/tasks/${task.id}/actions`, { body: { action, expectedVersion: task.version, note: note.trim() || null } });
      toast(action === 'approve' ? `«${label}» تأیید شد` : `«${label}» برای اصلاح برگشت`);
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'error');
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={`بررسی پایان «${label}»`}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>انصراف</button>
          <button type="button" className="btn" disabled={busy || note.trim().length < 3} onClick={() => void act('reopen')} title={note.trim().length < 3 ? 'برای برگرداندن، علت را بنویسید' : undefined}>نیاز به اصلاح دارد</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act('approve')}>{next ? `تأیید و ارجاع به ${next.title || next.department.name}` : 'تأیید پایان کار'}</button>
        </>
      }
    >
      <dl className="m-dl">
        <dt>جایگاه</dt><dd>{task.stationName || task.stationCode || task.department.name}</dd>
        <dt>تکنسین</dt><dd>{task.technicianName ?? '—'}</dd>
        <dt>پایان زده</dt><dd>{formatJalali(task.actualEndAt, { time: true })}</dd>
      </dl>
      <label className="field">
        <span>یادداشت (برای «نیاز به اصلاح» الزامی است)</span>
        <textarea className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Dialog>
  );
}
