'use client';
import { Suspense } from 'react';
import { StoppageList } from '@/components/Stoppages';

/** «خودروهای متوقف» from the official «گزارش توقف خودرو» of کسب‌وکار (owner, 2026-11-26). */
export default function StoppagePage() {
  return <Suspense fallback={<p className="m-empty" role="status">در حال بارگذاری…</p>}><StoppageList /></Suspense>;
}
