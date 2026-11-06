'use client';
import Link from 'next/link';

/** "بازگشت" to the desk the page belongs to (every phase 3 page has one). */
export function BackLink({ href, label = 'بازگشت' }: { href: string; label?: string }) {
  return (
    <Link className="btn btn-ghost back-link no-print" href={href}>
      <span aria-hidden="true">→</span> {label}
    </Link>
  );
}
