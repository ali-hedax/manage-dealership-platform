'use client';
import useSWR from 'swr';
import type { SpecialAidFeedback } from '@manage/shared';
import { errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SpecialAidTabs } from '@/components/SpecialAid';
import { FeedbackList } from '@/components/SpecialAidRecords';

/** Technical feedback and formal warnings: the manager sees all, each person sees what was sent to them. */
export default function SpecialAidFeedbackPage() {
  const { can } = useAuth();
  const { data, error, mutate } = useSWR<SpecialAidFeedback[]>('/special-aid/feedback', fetcher);
  const all = can('special_aid.warn') || can('special_aid.report');
  return (
    <div className="stack">
      <header className="unit-header"><div><h1>بازخورد فنی و تذکر رسمی</h1><p className="muted">{all ? 'همهٔ بازخوردها و تذکرهای ثبت‌شده و وضعیت تأیید دریافت.' : 'بازخوردها و تذکرهایی که برای شما ثبت شده است. تأیید دریافت به معنای پذیرش تقصیر نیست.'}</p></div></header>
      {can('special_aid.read') && <SpecialAidTabs />}
      {error && <p className="callout callout-red small" role="alert">{errorMessage(error)}</p>}
      <section className="panel" aria-label="فهرست"><div className="panel-body">{data ? <FeedbackList items={data} onChanged={() => void mutate()} /> : <p className="muted small" role="status">در حال خواندن…</p>}</div></section>
    </div>
  );
}
