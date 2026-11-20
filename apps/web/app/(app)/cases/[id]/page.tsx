'use client';

import Link from 'next/link';
import { CaseDocuments } from '@/components/CaseDocuments';
import { ExternalWorkPanel, PartsStatementPanel } from '@/components/PartsOperations';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import useSWR, { useSWRConfig } from 'swr';
import {
  MISSING_FIELD_LABELS,
  STAGE_LABELS,
  type CaseDetail,
  type CaseWorkflow,
} from '@manage/shared';
import { AssessmentPanel } from '@/components/AssessmentPanel';
import { BlockersPanel } from '@/components/BlockersPanel';
import { CompletionPanel } from '@/components/CompletionPanel';
import { FinancePanel } from '@/components/FinancePanel';
import { AlertsPanel } from '@/components/AlertsPanel';
import { CaseSection } from '@/components/CaseSection';
import { PartsLedger } from '@/components/PartsLedger';
import { ProvenancePanel } from '@/components/ProvenancePanel';
import { CoverageChip, StageChip } from '@/components/Chips';
import { TasksPanel } from '@/components/TasksPanel';
import { ResponsibilityBar } from '@/components/ResponsibilityBar';
import { CaseWagesPanel } from '@/components/CaseWagesPanel';
import { BackLink } from '@/components/BackLink';
import { CaseFolderHeader, SECTION_TAB, type CaseTab } from '@/components/CaseFolderHeader';
import { AppIcon } from '@/components/AppIcon';
import { VehicleImage, VehicleTechDetails } from '@/components/FolderParts';
import { ReminderComposer } from '@/components/ReminderComposer';
import { WorkflowAction } from '@/components/WorkflowAction';
import { Timeline } from '@/components/Timeline';
import { ApiError, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { workspaceHome } from '@/lib/workspaces';
import { deadlineTone, faNum, formatJalali, relativeDays, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';

function Missing() {
  return <span className="missing">نیازمند تکمیل</span>;
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, me } = useAuth();
  const toast = useToast();
  const { data: kase, error, mutate } = useSWR<CaseDetail>(`/cases/${id}`, fetcher);
  const { mutate: mutateKey } = useSWRConfig();
  const [reminding, setReminding] = useState(false);
  const [tab, setTab] = useState<CaseTab | null>(null);
  const [printing, setPrinting] = useState(false);
  const { data: workflow } = useSWR<CaseWorkflow>(`/cases/${id}/workflow?v=${kase?.version ?? 0}`, fetcher);
  // «#case-…» links (cards, desks, alerts, tests) open the tab that holds the section.
  useEffect(() => {
    const sync = () => { const t = SECTION_TAB[window.location.hash.slice(1)]; if (t) setTab(t); };
    setTab(SECTION_TAB[window.location.hash.slice(1)] ?? null);
    window.addEventListener('hashchange', sync);
    // Printing the folder prints every tab, rendered synchronously before the dialog opens.
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, [id]);
  useEffect(() => {
    if (tab !== null || !workflow || !me) return;
    const hashTab = SECTION_TAB[window.location.hash.slice(1)];
    const partsOnly = can('part.manage') && !can('assessment.manage');
    setTab(hashTab ?? (partsOnly ? (workflow.invoicePending ? 'completion' : 'parts') : workflow.current));
  }, [tab, workflow, me, can]);

  useEffect(() => {
    if (!kase) return;
    const anchor = window.location.hash.slice(1);
    if (SECTION_TAB[anchor] !== tab) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(anchor);
      if (element instanceof HTMLDetailsElement) element.open = true;
      element?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [kase?.id, tab]);

  if (error) {
    return (
      <div className="callout callout-red">
        {error instanceof ApiError && error.status === 404 ? 'این پرونده پیدا نشد.' : 'پرونده بارگذاری نشد.'}{' '}
        <Link href="/cases">بازگشت به فهرست</Link>
      </div>
    );
  }
  if (!kase) return <p className="muted">در حال بارگذاری…</p>;

  const active = kase.status === 'open' && kase.stage !== 'delivered';
  const commitment = kase.officialDeadlineAt ?? kase.forecastDeliveryAt;
  const tone = deadlineTone(commitment, active);
  const refresh = async () => {
    await mutate();
    // Assessment, parts and finance depend on each other and do not touch the
    // case version: refresh every view of this case (timeline included).
    await mutateKey((key) => (typeof key === 'string' && key.startsWith(`/cases/${id}/`)) ||
      (Array.isArray(key) && key[0] === '/emdad/requests/search' && key[1] === id));
  };

  const v = kase.vehicle;
  // Resume once on entry. Saving a form keeps the current section until the operator advances.
  const partsOnly = can('part.manage') && !can('assessment.manage');
  const defaultTab: CaseTab = partsOnly ? (workflow?.invoicePending ? 'completion' : 'parts') : workflow?.current ?? 'assessment';
  const activeTab = tab ?? defaultTab;
  function goTab(t: CaseTab, anchor?: string) {
    setTab(t);
    const hash = anchor ?? Object.keys(SECTION_TAB).find(key => SECTION_TAB[key] === t);
    if (hash) window.history.replaceState(null, '', `#${hash}`);
    if (anchor) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.getElementById(anchor);
        if (el instanceof HTMLDetailsElement) el.open = true;
        el?.scrollIntoView({ block: 'start' });
      }));
    }
  }
  const daily = 'case-side-act';
  const side = (
    <>
      <section className="side-vehicle" aria-label="مشخصات خودرو">
        <VehicleImage vehicle={(v.model || v.brand || kase.vehicleLabel).trim()} size="lg" />
        <dl className="veh-facts">
          <div><dt><AppIcon name="car" />مدل</dt><dd>{kase.vehicleSummary ?? (v.model || '—')}</dd></div>
          <div><dt><AppIcon name="calendar" />سال ساخت</dt><dd>{v.modelYear ? toPersianDigits(String(v.modelYear)) : '—'}</dd></div>
          <div><dt><AppIcon name="paint" />رنگ</dt><dd>{v.color ?? '—'}</dd></div>
          <div><dt><AppIcon name="idcard" />VIN</dt><dd><bdi dir="ltr">{v.vin ?? '—'}</bdi></dd></div>
          <div><dt><AppIcon name="receipt" />شمارهٔ پذیرش</dt><dd><bdi>{kase.admissionNo ? toPersianDigits(kase.admissionNo) : '—'}</bdi></dd></div>
        </dl>
        <VehicleTechDetails brand={v.brand} model={v.model} trim={v.trim} vin={v.vin} isacoCode={v.isacoCode} isacoConflict={v.isacoCodeConflict} />
      </section>
      <nav className="side-actions no-print" aria-label="اقدامات پرونده">
        {can('assessment.manage') && active && workflow?.current === 'assessment' && <a href="#case-assessment" className={`${daily} primary`} onClick={(e) => { e.preventDefault(); goTab('assessment', 'case-assessment'); }}><AppIcon name="clipboard" />شروع کارشناسی</a>}
        {can('case.update') && kase.status === 'open' && <Link className={daily} href={`/cases/${kase.id}/edit`}><AppIcon name="settings" />ویرایش پرونده</Link>}
        <button className={daily} type="button" onClick={() => window.print()}><AppIcon name="print" />چاپ</button>
        <button className={daily} type="button" onClick={() => goTab('docs')}><AppIcon name="doc" />مدارک</button>
        <button className={daily} type="button" onClick={() => setReminding(true)}><AppIcon name="bell" />فیدبک</button>
        {can('case.create') && (
          <details className="more-menu">
            <summary className={daily}><AppIcon name="list" />بیشتر ⋯</summary>
            <div className="more-pop" role="group" aria-label="اقدامات کم‌تکرار">
              <Link className={daily} href="/cases/new"><AppIcon name="add" />پذیرش بعدی</Link>
            </div>
          </details>
        )}
      </nav>
    </>
  );
  const chips = (
    <>
      <StageChip stage={kase.stage} />
      <CoverageChip coverage={kase.coverageType} />
      {kase.openBlockers > 0 && <span className="chip chip-red">{faNum(kase.openBlockers)} مانع باز</span>}
      {kase.isLegacyEntry && <span className="chip">ثبت‌شده از قبل از Manage</span>}
    </>
  );
  return (
    <div className="stack case-folder">
      <div className="cf-title-row">
        <p className="cf-title">پرونده خودرو</p>
        <BackLink href={workspaceHome(me)} label="بازگشت به میز کار" />
      </div>
      <CaseFolderHeader kase={kase} tab={activeTab} onTab={goTab} chips={chips} side={side}>
      <div id="case-tabpanel" role="tabpanel" aria-label={activeTab} className="stack cf-panel">
      {kase.missingFields.length > 0 && (
        <div className="callout callout-amber row" style={{ justifyContent: 'space-between' }}>
          <span>
            نیازمند تکمیل: {kase.missingFields.map((m) => MISSING_FIELD_LABELS[m] ?? m).join('، ')}
          </span>
          {can('case.update') && kase.status === 'open' && (
            <Link className="btn btn-sm" href={`/cases/${kase.id}/edit`}>
              تکمیل اطلاعات
            </Link>
          )}
        </div>
      )}
      {(printing || activeTab === 'execution') && <>
      <CaseSection id="case-tasks" title="اجرای تعمیر" note="شروع، پایان و تأیید فعالیت‌ها" initialOpen><TasksPanel kase={kase} mode="execution" onChange={refresh} /><ExternalWorkPanel kase={kase} onChange={refresh} /></CaseSection>
      <CaseSection id="case-blockers" title="موانع و پیگیری" initialOpen={kase.openBlockers > 0}><BlockersPanel kase={kase} onChange={refresh} /></CaseSection>
      <ResponsibilityBar kase={kase} onChange={refresh} />
      </>}

      {!printing && workflow && activeTab !== 'parts' && activeTab !== 'history' && activeTab !== 'docs' && <WorkflowAction kase={kase} workflow={workflow} tab={activeTab} onTab={goTab} onChange={refresh} />}
      {(printing || activeTab === 'assessment') && <CaseSection id="case-assessment" title="کارشناسی و الحاقیه" note="اقلام، فایل اکسل و ارسال به قطعات" initialOpen><AssessmentPanel kase={kase} onChange={refresh} />{!printing && <CaseDocuments kase={kase} onChange={refresh} />}</CaseSection>}

      {(printing || activeTab === 'intake') && <section id="case-intake" className="panel panel-body"><h2>پذیرش ثبت شده</h2><p>{kase.damageDescription ?? 'شرح خسارت ثبت نشده است'}</p>{active && can('case.update') && <Link href={`/cases/${id}/edit`} className="btn">ویرایش اطلاعات پذیرش</Link>}</section>}
      {(printing || activeTab === 'plan') && <CaseSection id="case-plan" title="برنامهٔ تعمیر" initialOpen><TasksPanel kase={kase} mode="plan" onChange={refresh} /></CaseSection>}
      {(printing || activeTab === 'quality') && <CaseSection id="case-quality" title="کنترل کیفیت" initialOpen><CompletionPanel kase={kase} mode="quality" onChange={refresh} /></CaseSection>}
      {(printing || activeTab === 'completion') && <CaseSection id="case-completion" title="تکمیل پرونده و تحویل" initialOpen><div id="case-invoice"><PartsStatementPanel kase={kase} /></div><CaseWagesPanel kase={kase} /><CompletionPanel kase={kase} mode="completion" onChange={refresh} /><div id="case-finance"><FinancePanel kase={kase} onChange={refresh} /></div></CaseSection>}
      {(printing || activeTab === 'parts') && <CaseSection id="case-parts" title="قطعات" note="یک فهرست: تعیین تکلیف، تأمین، قیمت و تحویل" initialOpen><PartsLedger kase={kase} title="قطعات این خودرو" onChange={refresh} /></CaseSection>}

      {(printing || activeTab === 'docs') && <>
      <CaseDocuments kase={kase} onChange={refresh} />
      <section className="panel times" aria-label="زمان‌ها">
        <div>
          <div className="k">پذیرش واقعی</div>
          <div className="v">
            {kase.admittedAtPrecision === 'date' ? (
              <>
                {formatJalali(kase.admittedAt)} <span className="xs muted">(ساعت نامعلوم)</span>
              </>
            ) : (
              formatJalali(kase.admittedAt, { time: true })
            )}
          </div>
          <div className="rel muted">ثبت در Manage: {formatJalali(kase.createdAt)}</div>
        </div>
        <div>
          <div className="k">مهلت رسمی / تعهد</div>
          <div className="v">{kase.officialDeadlineAt ? formatJalali(kase.officialDeadlineAt, { time: true }) : <Missing />}</div>
          {kase.officialDeadlineAt && active && (
            <div className="rel" style={{ color: tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--steel)' }}>
              {relativeDays(kase.officialDeadlineAt)}
            </div>
          )}
        </div>
        <div>
          <div className="k">پیش‌بینی تحویل</div>
          <div className="v">{formatJalali(kase.forecastDeliveryAt, { time: true })}</div>
          {kase.forecastDeliveryAt && active && <div className="rel muted">{relativeDays(kase.forecastDeliveryAt)}</div>}
        </div>
        <div>
          <div className="k">تحویل واقعی</div>
          <div className="v">{formatJalali(kase.actualDeliveryAt, { time: true })}</div>
          <div className="rel muted">پیشرفت فعالیت‌ها: {faNum(kase.progressPercent)}٪</div>
        </div>
      </section>
          <CaseSection id="case-info" title="مشخصات و شرح خسارت">
          <section className="panel">
            <div className="panel-head">
              <h2>مشخصات</h2>
            </div>
            <div className="panel-body">
              <dl className="dl">
                <dt>مالک</dt>
                <dd>{kase.customer?.fullName ?? <Missing />}</dd>
                <dt>تلفن</dt>
                <dd className="num">
                  {kase.customer?.phone ? <span className="ltr">{toPersianDigits(kase.customer.phone)}</span> : <Missing />}
                </dd>
                <dt>VIN</dt>
                <dd>{v.vin ? <span className="ltr">{v.vin}</span> : '—'}</dd>
                {v.chassisRef && (
                  <>
                    <dt>شاسی ثبت‌شده</dt>
                    <dd>
                      <bdi>{v.chassisRef}</bdi>
                    </dd>
                  </>
                )}
                {kase.admissionNo && (
                  <>
                    <dt>شماره کارت پذیرش</dt>
                    <dd>{kase.admissionNo}</dd>
                  </>
                )}
                <dt>کیلومتر</dt>
                <dd className="num">{kase.odometerKm != null ? faNum(kase.odometerKm) : <Missing />}</dd>
                <dt>محل خودرو</dt>
                <dd>{kase.vehicleLocation ?? '—'}</dd>
                <dt>مسئول پرونده</dt>
                <dd>{kase.responsible?.displayName ?? <Missing />}</dd>
                <dt>ثبت‌کننده</dt>
                <dd>{kase.createdBy.displayName}</dd>
                {(kase.coverageType === 'golden_card' || kase.coverageType === 'mixed') && (
                  <>
                    <dt>پرونده کارت طلایی</dt>
                    <dd>{kase.goldenCardFileNo ?? <Missing />}</dd>
                  </>
                )}
                {(kase.coverageType === 'insurance' || kase.coverageType === 'mixed') && (
                  <>
                    <dt>بیمه</dt>
                    <dd>{kase.insurerName ?? <Missing />}</dd>
                    <dt>شماره خسارت</dt>
                    <dd>{kase.insuranceClaimNo ?? <Missing />}</dd>
                  </>
                )}
                {kase.coverageNotes && (
                  <>
                    <dt>توضیح پوشش</dt>
                    <dd>{kase.coverageNotes}</dd>
                  </>
                )}
              </dl>
              <h3 style={{ marginTop: 14 }}>شرح خسارت</h3>
              <p className="small" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                {kase.damageDescription ?? <Missing />}
              </p>
            </div>
          </section>
          </CaseSection>

          <CaseSection id="case-provenance" title="منبع و سابقه ورود اطلاعات"><ProvenancePanel kase={kase} /></CaseSection>

      </>}

      {(printing || activeTab === 'history') && <>
          {can('audit.read') && (
            <CaseSection id="case-history" title="تاریخچه تغییرات" initialOpen><section className="panel">
              <div className="panel-head">
                <h2>تاریخچه</h2>
              </div>
              <div className="panel-body">
                <Timeline caseId={kase.id} version={kase.version + kase.tasks.reduce((s, t) => s + t.version, 0) + kase.blockers.length} />
              </div>
            </section>
            </CaseSection>
          )}
          {!can('audit.read') && <p className="m-empty">تاریخچهٔ تغییرات برای نقش شما باز نیست.</p>}
      </>}
      </div>
      </CaseFolderHeader>
      <ReminderComposer
        open={reminding}
        onClose={() => setReminding(false)}
        defaults={{ caseId: kase.id, caseLabel: kase.caseNumber, plate: v.plate, userIds: kase.responsible ? [kase.responsible.id] : [], role: kase.responsible ? undefined : 'accident_expert' }}
      />
    </div>
  );
}
