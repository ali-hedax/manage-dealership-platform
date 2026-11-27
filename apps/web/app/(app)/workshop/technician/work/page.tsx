'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * «کارکرد ماه» showed the technician's wages; the technician no longer sees any amount (owner,
 * 2026-11-27). Old links and bookmarks land on the job list instead.
 */
export default function MyWorkPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/workshop/technician'); }, [router]);
  return <p className="m-empty" role="status">در حال رفتن به کارهای من…</p>;
}
