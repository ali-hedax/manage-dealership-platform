'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

/** Native <dialog>: focus trap, Esc to close and backdrop come from the browser. */
export function Dialog({ open, title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
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
