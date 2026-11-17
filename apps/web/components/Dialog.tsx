'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** Element to focus when the dialog closes (when the opener was disabled meanwhile). */
  returnFocus?: HTMLElement | null;
}

/** Native <dialog>: focus trap, Esc to close and backdrop come from the browser; focus returns to the opener. */
export function Dialog({ open, title, onClose, children, footer, returnFocus }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = returnFocus ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
      el.showModal();
    }
    if (!open && el.open) el.close();
    if (!open && opener.current) {
      const back = opener.current;
      opener.current = null;
      // The opener may be re-enabled only after this render; focus it on the next frame.
      requestAnimationFrame(() => { if (back.isConnected) back.focus(); });
    }
  }, [open, returnFocus]);
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-label={title}>
      {open && (
        <>
          <div className="dialog-head">{title}</div>
          <div className="dialog-body">{children}</div>
          <div className="dialog-foot">{footer}</div>
        </>
      )}
    </dialog>
  );
}
