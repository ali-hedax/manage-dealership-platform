'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { CURRENT_RELEASE, type VersionInfo } from '@manage/shared';
import { api, fetcher } from '@/lib/api';

// Version indicator and update announcement (owner, 2026-11-18). The page knows the
// version it was built with (CURRENT_RELEASE); the server reports the running one.
// A different server version means a newer release went live while this page was
// open: Manage offers an explicit reload and never reloads by itself, so nothing
// typed in a form is lost. Each person sees the announcement once per version.

const KEY = '/releases/current';
const useCurrent = () => useSWR<VersionInfo>(KEY, fetcher, { refreshInterval: 5 * 60_000, revalidateOnFocus: true });

export function VersionChip() {
  const { data } = useCurrent();
  const version = data?.version ?? CURRENT_RELEASE.version;
  return (
    <Link href="/releases" className="version-chip" title="تاریخچهٔ نسخه‌ها و فهرست تغییرات" aria-label={`نسخهٔ ${version}، تاریخچهٔ نسخه‌ها`} data-testid="version-chip">
      <span className="vc-brand">Manage by HEDAX —</span> {version}
    </Link>
  );
}

export function ReleaseNotice() {
  const { data, mutate } = useCurrent();
  if (!data) return null;
  const ack = async () => {
    await api(`/releases/ack`, { body: { version: data.version } }).catch(() => undefined);
    await mutate();
  };
  if (data.version !== CURRENT_RELEASE.version) {
    return (
      <div className="release-notice no-print" role="region" aria-label="نسخهٔ تازهٔ منیج" data-testid="release-reload">
        <span className="grow"><b>نسخه جدید منیج منتشر شد</b> — <bdi dir="ltr">{data.version}</bdi>. کار در دست را ذخیره کنید و سپس صفحه را دوباره بارگذاری کنید.</span>
        <Link className="m-btn2-s" href="/releases">مشاهده تغییرات</Link>
        <button type="button" className="m-btn-s" onClick={() => window.location.reload()}>بارگذاری دوباره</button>
      </div>
    );
  }
  if (data.seen) return null;
  return (
    <div className="release-notice no-print" role="region" aria-label="اعلان نسخهٔ تازه" data-testid="release-notice">
      <span className="grow"><b>نسخه جدید منیج منتشر شد</b> — <bdi dir="ltr">{data.version}</bdi>. {CURRENT_RELEASE.summary}</span>
      <Link className="m-btn-s" href="/releases" onClick={() => void ack()}>مشاهده تغییرات</Link>
      <button type="button" className="m-btn2-s" onClick={() => void ack()}>متوجه شدم</button>
    </div>
  );
}
