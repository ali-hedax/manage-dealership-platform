'use client';

import { canResolveBlocker, type WorkflowBlocker } from '@manage/shared';
import { useAuth } from '@/lib/auth';
import { Dialog } from './Dialog';

/**
 * Persian RTL guidance when a workflow action is refused (owner, 2026-11-17):
 * for each missing prerequisite what is missing, how to resolve it, and either
 * a button to the right section of the same case (authorized user) or the role
 * that can resolve it. «تلاش دوباره» repeats the original action after the fix.
 */
export function WorkflowBlockerDialog({ blockers, title = 'این کار هنوز انجام نمی‌شود', onClose, onRetry, busy = false, returnFocus }: {
  blockers: WorkflowBlocker[] | null;
  title?: string;
  onClose: () => void;
  onRetry?: () => void;
  busy?: boolean;
  returnFocus?: HTMLElement | null;
}) {
  const { can } = useAuth();
  const list = blockers ?? [];
  return (
    <Dialog
      open={list.length > 0}
      title={title}
      onClose={onClose}
      returnFocus={returnFocus}
      footer={
        <>
          {onRetry && <button type="button" className="btn btn-primary" disabled={busy} onClick={onRetry}>{busy ? 'در حال تلاش…' : 'تلاش دوباره'}</button>}
          <button type="button" className="btn" disabled={busy} onClick={onClose} autoFocus={!onRetry}>بستن</button>
        </>
      }
    >
      <div dir="rtl" data-testid="workflow-blockers">
        {list.length > 1 && <p className="small">برای ادامه، این {list.length.toLocaleString('fa-IR')} مورد باید برطرف شود:</p>}
        <ol className="blocker-steps">
          {list.map((b) => {
            const mine = canResolveBlocker(b, (p) => can(p));
            const href = `/cases/${b.target.caseId}#${b.target.anchor ?? `case-${b.target.tab}`}`;
            return (
              <li key={b.code} data-code={b.code}>
                <strong>{b.message}</strong>
                <p className="small">{b.resolution}</p>
                {mine ? (
                  <a className="btn btn-sm btn-primary" href={href} onClick={onClose}>{b.actionLabel}</a>
                ) : (
                  <p className="small muted">چه کسی می‌تواند برطرف کند: <b>{b.role}</b>. پس از اصلاح، «تلاش دوباره» را بزنید.</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Dialog>
  );
}
