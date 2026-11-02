'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  CASE_STAGES,
  MISSING_FIELD_LABELS,
  STAGE_LABELS,
  type CaseDetail,
  type CaseStage,
} from '@manage/shared';
import { AssessmentPanel } from '@/components/AssessmentPanel';
import { BlockersPanel } from '@/components/BlockersPanel';
import { CompletionPanel } from '@/components/CompletionPanel';
import { FinancePanel } from '@/components/FinancePanel';
import { PartsPanel } from '@/components/PartsPanel';
import { ProvenancePanel } from '@/components/ProvenancePanel';
import { CoverageChip, StageChip } from '@/components/Chips';
import { Plate } from '@/components/Plate';
import { TasksPanel } from '@/components/TasksPanel';
import { Timeline } from '@/components/Timeline';
import { api, ApiError, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deadlineTone, faNum, formatJalali, relativeDays, toPersianDigits } from '@/lib/format';
import { useToast } from '@/lib/toast';

function Missing() {
  return <span className="missing">نیازمند تکمیل</span>;
}

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const toast = useToast();
  const { data: kase, error, mutate } = useSWR<CaseDetail>(`/cases/${id}`, fetcher);
  const { mutate: mutateKey } = useSWRConfig();
  const [stageBusy, setStageBusy] = useState(false);

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
  const refresh = () => {
    void mutate();
    // Assessment, parts and finance depend on each other and do not touch the
    // case version: refresh every view of this case (timeline included).
    void mutateKey((key) => typeof key === 'string' && key.startsWith(`/cases/${id}/`));
  };

  async function changeStage(stage: CaseStage) {
    if (!kase || stage === kase.stage) return;
    setStageBusy(true);
    try {
      await api(`/cases/${kase.id}/stage`, { body: { stage, expectedVersion: kase.version } });
      toast(`مرحله به «${STAGE_LABELS[stage]}» تغییر کرد`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    setStageBusy(false);
    refresh();
  }

  const v = kase.vehicle;
  return (
    <div className="stack">
      <div className="case-hero">
        <div className="stack" style={{ gap: 8 }}>
          <div className="ident">
            <span className="case-number">{toPersianDigits(kase.caseNumber)}</span>
            <Plate value={v.plate} large />
          </div>
          <div className="row" style={{ gap: 6 }}>
            <StageChip stage={kase.stage} />
            <CoverageChip coverage={kase.coverageType} />
            {kase.openBlockers > 0 && <span className="chip chip-red">{faNum(kase.openBlockers)} مانع باز</span>}
            {kase.isLegacyEntry && <span className="chip">ثبت‌شده از قبل از Manage</span>}
            {kase.isTest && <span className="chip chip-amber">داده آزمایشی</span>}
          </div>
          <div className="muted small">
            {toPersianDigits(kase.vehicleLabel)}
            {v.modelYear ? `، مدل ${toPersianDigits(v.modelYear)}` : ''}
            {v.color ? `، ${v.color}` : ''}
          </div>
        </div>
        <div className="row no-print">
          {can('case.update') && active && (
            <select
              className="input"
              style={{ width: 'auto' }}
              aria-label="تغییر مرحله"
              value={kase.stage}
              disabled={stageBusy}
              onChange={(e) => changeStage(e.target.value as CaseStage)}
            >
              {CASE_STAGES.map((s) => (
                // Ready for delivery and delivered come from the technical close and the handover.
                <option key={s} value={s} disabled={s !== kase.stage && (s === 'ready_for_delivery' || s === 'delivered')}>
                  مرحله: {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          )}
          {can('case.update') && kase.status === 'open' && (
            <Link className="btn" href={`/cases/${kase.id}/edit`}>
              ویرایش پرونده
            </Link>
          )}
          <button className="btn" type="button" onClick={() => window.print()}>
            چاپ
          </button>
        </div>
      </div>

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

      <div className="grid-3" style={{ alignItems: 'start' }}>
        <div className="stack span-2">
          <AssessmentPanel kase={kase} onChange={refresh} />
          <PartsPanel kase={kase} onChange={refresh} />
          <TasksPanel kase={kase} onChange={refresh} />
          <BlockersPanel kase={kase} onChange={refresh} />
          <CompletionPanel kase={kase} onChange={refresh} />
        </div>

        <div className="stack">
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

          <FinancePanel kase={kase} onChange={refresh} />

          <ProvenancePanel kase={kase} />

          {can('audit.read') && (
            <section className="panel">
              <div className="panel-head">
                <h2>تاریخچه</h2>
              </div>
              <div className="panel-body">
                <Timeline caseId={kase.id} version={kase.version + kase.tasks.reduce((s, t) => s + t.version, 0) + kase.blockers.length} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
