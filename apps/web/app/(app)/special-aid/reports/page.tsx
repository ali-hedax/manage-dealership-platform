'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { NON_CONSUMPTION_LABELS, NON_CONSUMPTION_REASONS, TECHNICAL_REASONS, type SpecialAidSummary } from '@manage/shared';
import { errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali } from '@/lib/format';
import { SpecialAidTabs } from '@/components/SpecialAid';

/** Read-only management view of the module: no routine operator task is asked of the manager. */
export default function SpecialAidReports() {
  const { can } = useAuth();
  const { data: s, error } = useSWR<SpecialAidSummary>(can('special_aid.report') ? '/special-aid/summary' : null, fetcher);
  if (!can('special_aid.report')) return <div className="stack"><SpecialAidTabs /><div className="callout"><h1>گزارش‌های امداد ویژه</h1><p>برای این بخش مجوز ندارید.</p></div></div>;
  const pct = (a: number, b: number) => (b ? `${faNum(Math.round((a / b) * 100))}٪` : '—');
  const kpi = (label: string, value: string, href?: string) => href
    ? <Link className="kpi" href={href}><span className="kpi-value">{value}</span><span className="kpi-label">{label}</span></Link>
    : <div className="kpi" role="group" aria-label={label}><span className="kpi-value">{value}</span><span className="kpi-label">{label}</span></div>;
  return (
    <div className="stack">
      <header className="unit-header"><div><h1>گزارش مدیریتی امداد ویژه</h1><p className="muted">فقط نمایش؛ هر عدد به فهرست همان خودروها می‌رود. تقصیر شخصی تعیین نمی‌شود.</p></div></header>
      <SpecialAidTabs />
      {error && <p className="callout callout-red small" role="alert">{errorMessage(error)}</p>}
      {!s && !error && <p className="muted small" role="status">در حال خواندن…</p>}
      {s && <>
        <section className="kpis" aria-label="شاخص‌ها">
          {kpi('کل درخواست‌ها', faNum(s.total), '/special-aid/vehicles')}
          {kpi('در حال تأمین', faNum(s.pending), '/special-aid/supply')}
          {kpi('رسیده و مصرف‌نشده', faNum(s.arrivedUnused), '/special-aid/vehicles')}
          {kpi('بیش از ۲۰ روز از رسید', faNum(s.overdue), '/special-aid/vehicles')}
          {kpi('رزرو فعال برای خودرو', faNum(s.reserved))}
          {kpi('رزرو آزادشده', faNum(s.released))}
          {kpi('نصب‌شده', faNum(s.installed))}
          {kpi('میانگین روز تأمین (رسمی)', s.averageSupplyDays == null ? '—' : faNum(s.averageSupplyDays))}
          {kpi('اطلاع به‌موقع به مشتری', pct(s.contactCompliance.onTime, s.contactCompliance.due))}
          {kpi('مسئلهٔ فنی حل‌نشده', faNum(s.unresolvedTechnical))}
        </section>
        <section className="panel" aria-labelledby="aid-reasons"><div className="panel-head"><h2 id="aid-reasons">علت مصرف‌نشدن قطعه</h2></div><div className="panel-body">
          <table className="table static"><thead><tr><th>علت</th><th>تعداد</th><th>نوع</th></tr></thead><tbody>{NON_CONSUMPTION_REASONS.map((r) => <tr key={r}><td>{NON_CONSUMPTION_LABELS[r]}</td><td>{faNum(s.reasons[r])}</td><td className="small">{TECHNICAL_REASONS.includes(r) ? 'فنی' : 'مشتری یا تأمین'}</td></tr>)}</tbody></table>
        </div></section>
        <section className="panel" aria-labelledby="aid-weekly"><div className="panel-head"><h2 id="aid-weekly">روند هفتگی (هشت هفتهٔ اخیر)</h2></div><div className="panel-body">
          {s.weekly.length ? <div className="table-scroll"><table className="table static"><thead><tr><th>هفتهٔ شروع</th><th>ثبت امداد</th><th>رسید</th></tr></thead><tbody>{s.weekly.map((w) => <tr key={w.week}><td>{formatJalali(`${w.week}T12:00:00Z`)}</td><td>{faNum(w.registered)}</td><td>{faNum(w.arrived)}</td></tr>)}</tbody></table></div> : <p className="muted small">در هشت هفتهٔ اخیر داده‌ای نیست.</p>}
        </div></section>
      </>}
    </div>
  );
}
