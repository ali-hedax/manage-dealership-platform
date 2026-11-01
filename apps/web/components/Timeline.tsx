'use client';

import useSWR from 'swr';
import {
  AUDIT_ACTION_LABELS,
  AUTHORIZATION_SOURCE_LABELS,
  AUTHORIZATION_STATUS_LABELS,
  FINANCE_APPROVAL_STATUS_LABELS,
  PART_SOURCE_LABELS,
  PART_STATUS_LABELS,
  BLOCKER_REASON_LABELS,
  CASE_STATUS_LABELS,
  QC_CHECK_LABELS,
  QC_OUTCOME_LABELS,
  RECIPIENT_RELATION_LABELS,
  COVERAGE_LABELS,
  STAGE_LABELS,
  TASK_STATUS_LABELS,
  formatJalali,
  toPersianDigits,
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
  versionNo: 'نسخه',
  discoveredAt: 'کشف آسیب',
  description: 'شرح',
  quantity: 'تعداد',
  unitPriceRial: 'قیمت واحد',
  labourRial: 'اجرت',
  totalRial: 'جمع کل',
  deltaRial: 'تغییر نسبت به نسخه قبل',
  approvedRial: 'مبلغ تأییدشده',
  authorizationStatus: 'مجوز',
  decision: 'تصمیم مجوز',
  reference: 'شماره ثبت رسمی',
  source: 'منبع',
  supplier: 'تأمین‌کننده',
  orderRef: 'شماره سفارش',
  etaAt: 'زمان رسیدن',
  inStock: 'موجود در انبار',
  receiptDocNo: 'شماره رسید',
  recipientName: 'تحویل‌گیرنده',
  priceApprovalRef: 'شماره تأیید قیمت',
  amountRial: 'مبلغ',
  customerShareRial: 'سهم مشتری',
  insurerShareRial: 'سهم بیمه',
  companyShareRial: 'سهم شرکت',
  paymentRef: 'شماره دریافت',
  round: 'دور',
  outcome: 'نتیجه کنترل کیفیت',
  failed: 'موارد رد',
  actualDeliveryAt: 'تحویل واقعی',
  recipientRelation: 'نسبت تحویل‌گیرنده',
  financialCloseWaivedRial: 'مانده پذیرفته‌شده',
};

function show(field: string, v: unknown, action: string): string {
  if (v == null || v === '') return '—';
  if (field === 'stage') return STAGE_LABELS[v as keyof typeof STAGE_LABELS] ?? String(v);
  if (field === 'status' && action.startsWith('part.')) {
    return PART_STATUS_LABELS[v as keyof typeof PART_STATUS_LABELS] ?? String(v);
  }
  if (field === 'status' && action.startsWith('finance.')) {
    return FINANCE_APPROVAL_STATUS_LABELS[v as keyof typeof FINANCE_APPROVAL_STATUS_LABELS] ?? String(v);
  }
  if (field === 'status' && action.startsWith('case.')) {
    return CASE_STATUS_LABELS[v as keyof typeof CASE_STATUS_LABELS] ?? String(v);
  }
  if (field === 'outcome') return QC_OUTCOME_LABELS[v as keyof typeof QC_OUTCOME_LABELS] ?? String(v);
  if (field === 'failed' && Array.isArray(v)) {
    return v.length ? v.map((i) => QC_CHECK_LABELS[i as keyof typeof QC_CHECK_LABELS] ?? String(i)).join('، ') : '—';
  }
  if (field === 'recipientRelation') {
    return RECIPIENT_RELATION_LABELS[v as keyof typeof RECIPIENT_RELATION_LABELS] ?? String(v);
  }
  if (field === 'status') return TASK_STATUS_LABELS[v as keyof typeof TASK_STATUS_LABELS] ?? String(v);
  if (field === 'source' && action.startsWith('assessment.')) {
    return AUTHORIZATION_SOURCE_LABELS[v as keyof typeof AUTHORIZATION_SOURCE_LABELS] ?? String(v);
  }
  if (field === 'source') return PART_SOURCE_LABELS[v as keyof typeof PART_SOURCE_LABELS] ?? String(v);
  if (typeof v === 'boolean') return v ? 'بله' : 'خیر';
  if (typeof v === 'number' && !field.endsWith('Rial')) return toPersianDigits(v);
  if (field === 'coverageType') return COVERAGE_LABELS[v as keyof typeof COVERAGE_LABELS] ?? String(v);
  if (field === 'authorizationStatus' || field === 'decision') {
    return AUTHORIZATION_STATUS_LABELS[v as keyof typeof AUTHORIZATION_STATUS_LABELS] ?? String(v);
  }
  if (field.endsWith('Rial') && typeof v === 'number') return `${toPersianDigits(v.toLocaleString('en-US'))} ریال`;
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
        // Removals carry only "before"; everything else is shown from "after".
        const shown = Object.keys(after).length ? after : before;
        const fields = e.action === 'case.created' ? [] : Object.keys(shown).filter((k) => k in FIELD_LABELS);
        return (
          <li key={e.id}>
            <div>
              <strong>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</strong>
              <span className="muted xs"> {formatJalali(e.occurredAt, { time: true })}، {e.actor?.displayName ?? 'سیستم'}</span>
            </div>
            {fields.map((k) => (
              <div key={k} className="xs muted">
                {FIELD_LABELS[k]}: {k in before && k in after ? `${show(k, before[k], e.action)} ← ` : ''}
                {show(k, shown[k], e.action)}
              </div>
            ))}
            {e.reason && <div className="xs">{e.reason}</div>}
          </li>
        );
      })}
    </ul>
  );
}
