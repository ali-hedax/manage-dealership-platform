'use client';

import Link from 'next/link';
import type { ReportResult } from '@manage/shared';
import { faNum, toPersianDigits } from '@/lib/format';

type Chart = ReportResult['charts'][number];

/**
 * Horizontal bars (stages, causes) or paired bars per period (trend), with
 * the same numbers as a table for screen readers and print. A bar only
 * navigates or filters; it never changes data.
 */
export function ReportChart({ chart, onFilter }: { chart: Chart; onFilter: (query: string) => void }) {
  const values = chart.kind === 'trend' ? (chart.series ?? []).flatMap((s) => s.values) : chart.bars.map((b) => b.value);
  const max = Math.max(1, ...values);
  // Zero is data ("no admissions this week"); only a section without rows is empty.
  const empty = chart.bars.length === 0;

  return (
    <section className="panel" data-testid={`chart-${chart.key}`}>
      <div className="panel-head">
        <h2>{chart.title}</h2>
        <span className="xs muted">واحد: {chart.unit}</span>
      </div>
      <div className="panel-body stack" style={{ gap: 10 }}>
        {empty ? (
          <p className="muted small">داده‌ای برای این بخش در فیلتر فعلی وجود ندارد.</p>
        ) : chart.kind === 'bar' ? (
          <ul className="hbars" aria-hidden="true">
            {chart.bars.map((b) => {
              const bar = (
                <>
                  <span className="hbar-label">{toPersianDigits(b.label)}</span>
                  <span className="hbar-track">
                    <span className="hbar-fill" style={{ inlineSize: `${(b.value / max) * 100}%` }} />
                  </span>
                  <span className="hbar-value num">{faNum(b.value)}</span>
                </>
              );
              return (
                <li key={b.key}>
                  {b.listQuery ? (
                    <Link className="hbar" href={`/cases?${b.listQuery}`} tabIndex={-1}>
                      {bar}
                    </Link>
                  ) : b.reportQuery || b.itemKind ? (
                    <button type="button" className="hbar" tabIndex={-1} onClick={() => onFilter(b.reportQuery ?? `tab=today&kind=${b.itemKind}`)}>
                      {bar}
                    </button>
                  ) : (
                    <div className="hbar">{bar}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="trend" aria-hidden="true">
            {chart.bars.map((b, i) => (
              <div key={b.key} className="trend-col" title={b.label}>
                <div className="trend-bars">
                  {(chart.series ?? []).map((s, si) => (
                    <span key={s.label} className={`trend-bar s${si}`} style={{ blockSize: `${((s.values[i] ?? 0) / max) * 100}%` }} />
                  ))}
                </div>
                <span className="trend-label">{i % Math.ceil(chart.bars.length / 8) === 0 ? b.label.slice(5) : ''}</span>
              </div>
            ))}
            <div className="trend-legend">
              {(chart.series ?? []).map((s, si) => (
                <span key={s.label}>
                  <i className={`trend-bar s${si}`} /> {s.label}
                </span>
              ))}
            </div>
          </div>
        )}
        {chart.excluded && chart.excluded.count > 0 && (
          <p className="callout callout-amber small">
            {faNum(chart.excluded.count)} پرونده کنار گذاشته شد: {chart.excluded.reason}. داده کافی برای آن‌ها موجود نیست.
          </p>
        )}
        {chart.note && <p className="xs muted">{chart.note}</p>}
        {!empty && (
          <details>
            <summary className="small">نمایش جدول همین نمودار</summary>
            <table className="table static">
              <thead>
                <tr>
                  <th>{chart.kind === 'trend' ? 'دوره' : 'دسته'}</th>
                  {chart.kind === 'trend' ? (chart.series ?? []).map((s) => <th key={s.label}>{s.label}</th>) : <th>{chart.unit}</th>}
                </tr>
              </thead>
              <tbody>
                {chart.bars.map((b, i) => (
                  <tr key={b.key}>
                    <td>
                      {b.listQuery ? <Link href={`/cases?${b.listQuery}`}>{toPersianDigits(b.label)}</Link> : toPersianDigits(b.label)}
                    </td>
                    {chart.kind === 'trend' ? (
                      (chart.series ?? []).map((s) => (
                        <td key={s.label} className="num">
                          {faNum(s.values[i] ?? 0)}
                        </td>
                      ))
                    ) : (
                      <td className="num">{faNum(b.value)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </section>
  );
}
