'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { toPersianDigits, type CaseDetail } from '@manage/shared';
import { CaseForm } from '@/components/CaseForm';
import { fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function EditCasePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  // Always edit the latest version: the form sends it as expectedVersion.
  const { data, error } = useSWR<CaseDetail>(`/cases/${id}`, fetcher, { revalidateOnFocus: false });
  if (!can('case.update')) return <div className="callout callout-blue">نقش شما اجازه ویرایش پرونده ندارد.</div>;
  if (error) return <div className="callout callout-red">پرونده بارگذاری نشد.</div>;
  if (!data) return <p className="muted">در حال بارگذاری…</p>;
  return (
    <div className="stack">
      <div className="page-head">
        <h1>ویرایش پرونده {toPersianDigits(data.caseNumber)}</h1>
      </div>
      <CaseForm existing={data} />
    </div>
  );
}
