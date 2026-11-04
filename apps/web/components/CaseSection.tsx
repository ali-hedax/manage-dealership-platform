'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Native disclosure keeps keyboard support and opens when following a section link. */
export function CaseSection({ id, title, note, initialOpen = false, children }: {
  id: string; title: string; note?: string; initialOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  const element = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function follow() {
      if (window.location.hash === `#${id}`) {
        setOpen(true);
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
      }
    }
    function followClick(event: MouseEvent) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      if (event.target.closest('a')?.getAttribute('href') === `#${id}`) {
        setOpen(true);
        requestAnimationFrame(() => element.current?.scrollIntoView({ block: 'start' }));
      }
    }
    let printWasOpen = initialOpen;
    function beforePrint() { if (element.current) { printWasOpen = element.current.open; element.current.open = true; } }
    function afterPrint() { if (element.current) element.current.open = printWasOpen; setOpen(printWasOpen); }
    follow(); window.addEventListener('hashchange', follow);
    document.addEventListener('click', followClick);
    window.addEventListener('beforeprint', beforePrint); window.addEventListener('afterprint', afterPrint);
    return () => { window.removeEventListener('hashchange', follow); document.removeEventListener('click', followClick); window.removeEventListener('beforeprint', beforePrint); window.removeEventListener('afterprint', afterPrint); };
  }, [id, initialOpen]);
  return <details ref={element} id={id} className="case-section" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary><span><strong>{title}</strong>{note && <small>{note}</small>}</span><span className="disclosure-mark" aria-hidden="true">+</span></summary>
    <div className="case-section-content">{children}</div>
  </details>;
}
