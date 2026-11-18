'use client';
import { useEffect } from 'react';
import useSWR from 'swr';
import { type ReleaseHistoryEntry, type VersionInfo } from '@manage/shared';
import { api, fetcher } from '@/lib/api';
import { formatJalali, toPersianDigits } from '@/lib/format';

/** «تاریخچهٔ نسخه‌ها»: every released version with its date, commit and complete Persian change list. */
export default function ReleasesPage() {
  const { data, error } = useSWR<ReleaseHistoryEntry[]>('/releases', fetcher);
  const { data: current, mutate } = useSWR<VersionInfo>('/releases/current', fetcher);
  // Opening the notes counts as having seen the announcement of the running version.
  useEffect(() => {
    if (current && !current.seen) void api('/releases/ack', { body: { version: current.version } }).then(() => mutate()).catch(() => undefined);
  }, [current, mutate]);
  return (
    <div className="stack">
      <header className="unit-header">
        <div>
          <h1>تاریخچهٔ نسخه‌ها</h1>
          <p className="muted">نسخهٔ در حال اجرا: <bdi dir="ltr">{current?.version ?? '…'}</bdi>{current?.deployedAt ? ` · منتشرشده ${formatJalali(current.deployedAt, { time: true })}` : ''}</p>
        </div>
      </header>
      {error && <p className="callout callout-red" role="alert">دریافت تاریخچهٔ نسخه‌ها ناموفق بود.</p>}
      {!data && !error && <p role="status">در حال دریافت…</p>}
      <div className="release-list">
        {data?.map((r) => (
          <article key={r.version} className="release-card" data-testid="release">
            <h2>تغییرات نسخه <bdi dir="ltr">{r.version}</bdi></h2>
            <div className="release-meta">
              تاریخ انتشار {r.deployedAt ? formatJalali(r.deployedAt, { time: true }) : formatJalali(`${r.date}T08:30:00Z`)}
              {r.commit ? <> · commit <bdi dir="ltr">{r.commit.slice(0, 7)}</bdi></> : null}
            </div>
            <p>{r.summary}</p>
            {r.sections.map((s) => (
              <section key={s.title}>
                <h3>{s.title}</h3>
                <ul>{s.items.map((i) => <li key={i}>{toPersianDigits(i)}</li>)}</ul>
              </section>
            ))}
          </article>
        ))}
      </div>
    </div>
  );
}
