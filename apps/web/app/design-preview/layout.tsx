import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import '@fontsource/vazirmatn/300.css';
import '../ds-tokens.css';
import '../ds-components.css';
import './screens.css';

// Design preview (slices S03/S04): the locked design system and the seven key screens with
// synthetic data only. No API calls from the pages, no real customer data; staging sits behind
// its own password. Never reachable in production (owner, 2026-11-27): the same image runs on
// staging and production, so the environment is asked from the API on every request, and the
// preview answers 404 when it is production or cannot be told (fail closed).
export const metadata: Metadata = { title: 'Manage · پیش‌نمایش طراحی', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

async function environment(): Promise<string | null> {
  try {
    const base = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    const res = await fetch(`${base}/api/v1/health`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return ((await res.json()) as { environment?: unknown }).environment as string ?? null;
  } catch {
    return null;
  }
}

export default async function DesignPreviewLayout({ children }: { children: ReactNode }) {
  const env = await environment();
  if (!env || env === 'production') notFound();
  return <div className="ds-root">{children}</div>;
}
