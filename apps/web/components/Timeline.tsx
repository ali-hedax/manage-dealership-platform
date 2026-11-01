'use client';

import useSWR from 'swr';
import {
  AUDIT_ACTION_LABELS,
  BLOCKER_REASON_LABELS,
  COVERAGE_LABELS,
  STAGE_LABELS,
  TASK_STATUS_LABELS,
  formatJalali,
  type TimelineEvent,
} from '@manage/shared';
import { fetcher } from '@/lib/api';

const FIELD_LABELS: Record<string, string> = {
  stage: 'مرحله',
  status: 'وضعیت',
  coverageType: 'پوشش',
  officialDeadlineAt: 'مهلت رسمی',
  forecastDeliveryAt: 'پیش‌بینی تحویل',
  admittedAt: 'زمان پذیرش',
  responsibleUserId: 'مسئول',
  damageDescription: 'شرح خسارت',
  vehicleLocation: 'محل خودرو',
  odometerKm: 'کیلومتر',
  goldenCardFileNo: 'شماره کارت طلایی',
  insurerName: 'شرکت بیمه',
  insuranceClaimNo: 'شماره خسارت',
  coverageNotes: 'توضیح پوشش',
  plate: 'پلاک',
  vin: 'VIN',
  model: 'مدل',
  fullName: 'نام مالک',
  phone: 'تلفن',
  technicianName: 'تکنسین',
  plannedStartAt: 'شروع برنامه‌ای',
  plannedEndAt: 'پایان برنامه‌ای',
  dependsOn: 'پیش‌نیازها',
  reason: 'علت',
};

function show(field: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (field === 'stage') return STAGE_LABELS[v as keyof typeof STAGE_LABELS] ?? String(v);
  if (field === 'status') return TASK_STATUS_LABELS[v as keyof typeof TASK_STATUS_LABELS] ?? String(v);
  if (field === 'coverageType') return COVERAGE_LABELS[v as keyof typeof COVERAGE_LABELS] ?? String(v);
  if (field === 'reason') return BLOCKER_REASON_LABELS[v as keyof typeof BLOCKER_REASON_LABELS] ?? String(v);
  if (field.endsWith('At') && typeof v === 'string') return formatJalali(v, { time: true });
  if (field === 'responsibleUserId' || field === 'dependsOn') return 'تغییر کرد';
  return String(v);
}

export function Timeline({ caseId, version }: { caseId: string; version: number }) {
  const { data } = useSWR<TimelineEvent[]>(`/cases/${caseId}/timeline?v=${version}`, fetcher);
  if (!data) return <p className="muted small">در حال بارگذاری…</p>;
  return (
    <ul className="timeline">
      {data.map((e) => {
        const before = (e.summary?.before ?? {}) as Record<string, unknown>;
        const after = (e.summary?.after ?? {}) as Record<string, unknown>;
        const fields = e.action === 'case.created' ? [] : Object.keys(after).filter((k) => k in FIELD_LABELS);
        return (
          <li key={e.id}>
            <div>
              <strong>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</strong>
              <span className="muted xs"> {formatJalali(e.occurredAt, { time: true })}، {e.actor?.displayName ?? 'سیستم'}</span>
            </div>
            {fields.map((k) => (
              <div key={k} className="xs muted">
                {FIELD_LABELS[k]}: {k in before ? `${show(k, before[k])} ← ` : ''}
                {show(k, after[k])}
              </div>
            ))}
            {e.reason && <div className="xs">{e.reason}</div>}
          </li>
        );
      })}
    </ul>
  );
}
