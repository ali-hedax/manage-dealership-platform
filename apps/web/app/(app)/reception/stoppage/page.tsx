'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { formatJalali, type StoppageResult } from '@manage/shared';
import { EmptyState } from '@/components/EmptyState';
import { errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const labels: Record<StoppageResult['state'], string> = {
  active: 'توقف فعال',
  resolved: 'توقف رفع‌شده',
  no_record: 'استعلام موفق، بدون سابقه',
  error: 'خطای استعلام',
  stale: 'دادهٔ قدیمی',
};

type Sample = { reference: string; inNightList: boolean; result: StoppageResult };

function comparison({ result, inNightList }: Sample): string {
  if (result.state === 'error' || result.state === 'stale') return 'مقایسه نامشخص';
  if (result.state === 'active') return inNightList ? 'در هر دو گزارش' : 'فقط توقف رسمی';
  return inNightList ? 'فقط لیست شب' : 'خارج از هر دو گزارش فعال';
}

export default function StoppagePage() {
  const allowed = useAuth().can('reception.read');
  const { data, error } = useSWR<{ mode: 'validation'; samples: Sample[] }>(allowed ? '/reception/stoppage' : null, fetcher);
  if (!allowed) return <EmptyState heading="h1" icon="lock" title="گزارش توقف رسمی">برای این بخش مجوز ندارید.</EmptyState>;
  return <section className="stack rcp-folder" aria-labelledby="stoppage-title">
    <header className="desk-head">
      <div className="desk-hello">
        <h1 id="stoppage-title">گزارش توقف رسمی</h1>
        <p className="desk-sub">در حال اعتبارسنجی</p>
      </div>
      <Link href="/reception/night" className="btn btn-sm">بازگشت به لیست شب</Link>
    </header>
    <p className="callout">ردیف‌های زیر ساختگی‌اند. اتصال به استعلام رسمی ایساکو پس از بررسی نمونه‌های منبع فعال می‌شود.</p>
    {error && <p className="m-error" role="alert">{errorMessage(error)}</p>}
    {!data && !error && <p role="status">در حال خواندن نمونه‌ها…</p>}
    {data && <ul className="rcp-lines" aria-label="نمونه‌های اعتبارسنجی">
      {data.samples.map((sample) => {
        const { result } = sample;
        const detail = result.state === 'stale' ? result.lastKnown : result;
        const record = 'record' in detail ? detail.record : undefined;
        return <li key={sample.reference} className="panel">
          <div className="row"><strong>{labels[result.state]}</strong><bdi dir="ltr">{sample.reference}</bdi></div>
          <p className="small">{comparison(sample)}</p>
          {result.state === 'stale' && <p className="small">آخرین وضعیت ثبت‌شده: {labels[result.lastKnown.state]}</p>}
          {record?.reason && <p>دلیل: {record.reason}</p>}
          {record?.part && <p>قطعه: {record.part}</p>}
          {record?.openedAt && <p>شروع توقف: {formatJalali(record.openedAt, { time: true })}</p>}
          {record?.resolvedAt && <p>رفع توقف: {formatJalali(record.resolvedAt, { time: true })}</p>}
        </li>;
      })}
    </ul>}
  </section>;
}
