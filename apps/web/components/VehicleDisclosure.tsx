'use client';

import { toPersianDigits } from '@manage/shared';
import type { ReactNode } from 'react';

/**
 * Reusable compact vehicle identity. Prefer a separately supplied core model;
 * otherwise only split on explicit detail separators, never guess where a
 * multi-word model ends.
 */
export function VehicleDisclosure({ label, details, className }: {
  label: string | null | undefined;
  details?: ReactNode;
  className?: string;
}) {
  const raw = (label ?? '').trim() || 'خودروی نامشخص';
  const parts = raw.split(/\s*(?:،|\s+[-–—]\s+|\s+\|\s+)\s*/);
  const title = parts[0]?.trim() || raw;
  const rest = parts.slice(1).join('، ').trim();
  const hasExtra = !!rest || !!details;
  if (!hasExtra) return <span className={className}>{toPersianDigits(title)}</span>;
  return (
    <details className={className} onClick={e => e.stopPropagation()}>
      <summary style={{ cursor: 'pointer', listStyle: 'revert', display: 'list-item' }}>
        <strong>{toPersianDigits(title)}</strong>
      </summary>
      <div className="small muted" style={{ paddingBlockStart: 6 }}>
        {rest ? <div>{toPersianDigits(rest)}</div> : null}
        {details}
      </div>
    </details>
  );
}
