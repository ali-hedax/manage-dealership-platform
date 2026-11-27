'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { releaseHighlights, type VersionInfo } from '@manage/shared';
import { api, fetcher } from '@/lib/api';
import { formatJalali } from '@/lib/format';

// Version indicator and update announcement (owner, 2026-11-18). Version numbers are
// given on the server when a release is confirmed after its health checks, so the
// page compares the running commit it first saw with the one the server reports now:
// a different commit means a newer release went live while this page was open.
// Manage offers an explicit reload and never reloads by itself, so nothing typed in
// a form is lost. Each person sees the announcement once per version.

const KEY = '/releases/current';
const useCurrent = () => useSWR<VersionInfo>(KEY, fetcher, { refreshInterval: 5 * 60_000, revalidateOnFocus: true });

const label = (v: VersionInfo | undefined) => (v ? v.version ?? `${v.line}.x${v.commit ? ` · build ${v.commit.slice(0, 7)}` : ''}` : '…');

export function VersionChip() {
  const { data } = useCurrent();
  const date = data?.deployedAt ? formatJalali(data.deployedAt) : null;
  return (
    <Link href="/releases" className="version-chip" title={data?.summary || 'تاریخچهٔ نسخه‌ها و فهرست تغییرات'} aria-label={`نسخهٔ ${label(data)}${date ? `، منتشرشده ${date}` : ''}، تاریخچهٔ نسخه‌ها`} data-testid="version-chip">
      <span className="vc-brand">Manage by HEDAX —</span> <bdi dir="ltr">{label(data)}</bdi>
      {date && <span className="vc-date"> · {date}</span>}
    </Link>
  );
}

export function ReleaseNotice() {
  const { data, mutate } = useCurrent();
  // The commit this page was loaded with; a different one later means a new release went live.
  const [first, setFirst] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (data && first === undefined) setFirst(data.commit);
  }, [data, first]);
  if (!data || first === undefined) return null;
  const ack = async () => {
    if (!data.version) return;
    await api(`/releases/ack`, { body: { version: data.version } }).catch(() => undefined);
    await mutate();
  };
  if (first !== data.commit) {
    return (
      <div className="release-notice no-print" role="region" aria-label="نسخهٔ تازهٔ منیج" data-testid="release-reload">
        <span className="grow"><b>نسخه جدید منیج منتشر شد</b> — <bdi dir="ltr">{label(data)}</bdi>. کار در دست را ذخیره کنید و سپس صفحه را دوباره بارگذاری کنید.</span>
        <Link className="m-btn2-s" href="/releases">مشاهده تغییرات</Link>
        <button type="button" className="m-btn-s" onClick={() => window.location.reload()}>بارگذاری دوباره</button>
      </div>
    );
  }
  if (data.seen || !data.version) return null;
  return (
    <div className="release-notice no-print" role="region" aria-label="اعلان نسخهٔ تازه" data-testid="release-notice">
      <div className="grow">
        <b>نسخه جدید منیج منتشر شد</b> — <bdi dir="ltr">{data.version}</bdi>{data.deployedAt ? ` (${formatJalali(data.deployedAt)})` : ''}
        {/* At most five short lines; the full change list is on «/releases» (owner, 2026-11-27). */}
        <ul className="release-bullets">{releaseHighlights(data.summary).map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
      <Link className="m-btn-s" href="/releases" onClick={() => void ack()}>مشاهده تغییرات</Link>
      <button type="button" className="m-btn2-s" onClick={() => void ack()}>متوجه شدم</button>
    </div>
  );
}
