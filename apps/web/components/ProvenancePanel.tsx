'use client';

import useSWR from 'swr';
import { VEHICLE_IMPORT_OUTCOME_LABELS, type CaseDetail, type CaseProvenance } from '@manage/shared';
import { fetcher } from '@/lib/api';
import { faNum, formatJalali } from '@/lib/format';

/** Excel rows that created or updated this case, with the original cell values. */
export function ProvenancePanel({ kase }: { kase: CaseDetail }) {
  const { data } = useSWR<CaseProvenance[]>(`/cases/${kase.id}/provenance`, fetcher);
  if (!data?.length) return null;
  return (
    <section className="panel" data-testid="provenance-panel">
      <div className="panel-head">
        <h2>سابقه ورود از اکسل</h2>
      </div>
      <div className="panel-body stack" style={{ gap: 10 }}>
        {data.map((p) => (
          <details key={`${p.importId}-${p.rowNo}`} className="small">
            <summary>
              «{p.fileName}» ردیف {faNum(p.rowNo)} — {VEHICLE_IMPORT_OUTCOME_LABELS[p.outcome]}، {formatJalali(p.appliedAt, { time: true })}،{' '}
              {p.appliedBy.displayName}
            </summary>
            <dl className="dl" style={{ marginBlockStart: 8 }}>
              {Object.entries(p.source).map(([header, value]) => (
                <div key={header} style={{ display: 'contents' }}>
                  <dt>{header}</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
        <p className="xs muted">مقدارها عین فایل‌اند؛ توضیح، مانع، قطعه و وضعیت مالی فایل فقط این‌جا نگهداری می‌شوند.</p>
      </div>
    </section>
  );
}
