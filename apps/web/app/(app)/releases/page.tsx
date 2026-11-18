'use client';
import { useEffect } from 'react';
import useSWR from 'swr';
import { type ReleaseHistoryEntry, type VersionInfo } from '@manage/shared';
import { api, fetcher } from '@/lib/api';
import { formatJalali, toPersianDigits } from '@/lib/format';

/** «تاریخچهٔ نسخه‌ها»: every confirmed version with its Jalali date, commit and complete Persian change list. */
export default function ReleasesPage() {
  const { data, error } = useSWR<ReleaseHistoryEntry[]>('/releases', fetcher);
  const { data: current, mutate } = useSWR<VersionInfo>('/releases/current', fetcher);
  // Opening the notes counts as having seen the announcement of the running version.
  useEffect(() => {
    if (current?.version && !current.seen) void api('/releases/ack', { body: { version: current.version } }).then(() => mutate()).catch(() => undefined);
  }, [current, mutate]);
  return (
    <div className="stack">
      <header className="unit-header">
        <div>
          <h1>تاریخچهٔ نسخه‌ها</h1>
          <p className="muted" data-testid="running-version">
            نسخهٔ در حال اجرا: <bdi dir="ltr">{current ? current.version ?? `${current.line}.x (در انتظار تأیید انتشار)` : '…'}</bdi>
            {current?.deployedAt ? ` · منتشرشده ${formatJalali(current.deployedAt, { time: true })}` : ''}
          </p>
          {current?.summary && <p>{current.summary}</p>}
        </div>
      </header>
      {error && <p className="callout callout-red" role="alert">دریافت تاریخچهٔ نسخه‌ها ناموفق بود.</p>}
      {!data && !error && <p role="status">در حال دریافت…</p>}
      {data && !data.length && <p className="m-empty">هنوز نسخه‌ای پس از بررسی سلامت تأیید نشده است.</p>}
      <div className="release-list">
        {data?.map((r) => (
          <article key={r.version} className={`release-card${r.running ? ' running' : ''}`} data-testid="release">
            <h2>تغییرات نسخه <bdi dir="ltr">{r.version}</bdi>{r.running && <span className="m-tag ok">نسخهٔ فعال</span>}</h2>
            <div className="release-meta">
              تاریخ انتشار {formatJalali(r.deployedAt, { time: true })} · commit <bdi dir="ltr">{r.commit.slice(0, 7)}</bdi>
            </div>
            {r.summary ? <p>{r.summary}</p> : <p className="muted">این انتشار تغییر تازه‌ای برای کارکنان نداشت.</p>}
            {r.sections.map((s, i) => (
              <section key={`${s.title}-${i}`}>
                <h3>{s.title}</h3>
                <ul>{s.items.map((t) => <li key={t}>{toPersianDigits(t)}</li>)}</ul>
              </section>
            ))}
          </article>
        ))}
      </div>
    </div>
  );
}
