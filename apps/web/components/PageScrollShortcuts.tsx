'use client';

import { useEffect, useState } from 'react';

/** Non-invasive page navigation for long reports and lists; normal scroll remains intact. */
export function PageScrollShortcuts() {
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState({ top: true, bottom: false, long: false });

  useEffect(() => {
    setReady(true);
    const refresh = () => {
      const doc = document.documentElement;
      const max = Math.max(0, doc.scrollHeight - window.innerHeight);
      const y = Math.max(0, window.scrollY);
      setPosition(previous => {
        const next = { top: y <= 24, bottom: max - y <= 24, long: max > 320 };
        return previous.top === next.top && previous.bottom === next.bottom && previous.long === next.long ? previous : next;
      });
    };
    refresh();
    window.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    observer?.observe(document.body);
    return () => {
      window.removeEventListener('scroll', refresh);
      window.removeEventListener('resize', refresh);
      observer?.disconnect();
    };
  }, []);

  if (!ready || !position.long) return null;
  const navigate = (toEnd: boolean) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: toEnd ? document.documentElement.scrollHeight : 0, behavior: reduce ? 'instant' : 'smooth' });
  };
  return (
    <nav className="page-scroll-shortcuts no-print" aria-label="حرکت سریع در صفحه">
      <button type="button" title="رفتن به بالای صفحه" aria-label="رفتن به بالای صفحه" disabled={position.top} onClick={() => navigate(false)}>
        <span aria-hidden="true">↑</span>
      </button>
      <button type="button" title="رفتن به انتهای صفحه" aria-label="رفتن به انتهای صفحه" disabled={position.bottom} onClick={() => navigate(true)}>
        <span aria-hidden="true">↓</span>
      </button>
    </nav>
  );
}
