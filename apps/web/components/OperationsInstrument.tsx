import Link from 'next/link';
import type { DashboardSummary } from '@manage/shared';
import { faNum } from '@/lib/format';

type Tone = 'red' | 'amber' | 'green' | 'zero';

/**
 * Dashboard hero of the Signature theme: the share of active cases still within their
 * deadline on a dial, and the four figures that decide today's priorities. Every value
 * comes from the existing /dashboard summary; every readout opens the same filtered
 * case list as the "needs action" panel. Hidden (display:none) in the classic theme.
 */
export function OperationsInstrument({ data }: { data: DashboardSummary }) {
  const active = data.activeCases;
  const onTime = active ? Math.max(0, active - data.overdue) / active : 1;
  const pct = Math.round(onTime * 100);
  // 270° dial; circumference of r=80 is 502.65, three quarters is 376.99.
  const sweep = 376.99;
  const tone = (n: number, t: Exclude<Tone, 'zero'>): Tone => (n ? t : 'zero');
  const readouts: { href: string; n: number; label: string; note: string; tone: Tone }[] = [
    { href: '/cases?flag=overdue', n: data.overdue, label: 'از مهلت گذشته', note: 'مهلت رسمی یا پیش‌بینی', tone: tone(data.overdue, 'red') },
    { href: '/cases?flag=blocked', n: data.blockedCases, label: 'متوقف با مانع', note: `${faNum(data.staleBlockers)} مانع بی‌پیگیری`, tone: tone(data.blockedCases, 'red') },
    { href: '/cases?flag=due_soon', n: data.dueSoon, label: 'تحویل تا ۴۸ ساعت', note: 'برای تحویل به‌موقع', tone: tone(data.dueSoon, 'amber') },
    { href: '/cases?flag=ready', n: data.readyForDelivery, label: 'آمادهٔ تحویل به مشتری', note: 'هماهنگی با مشتری', tone: tone(data.readyForDelivery, 'green') },
  ];
  return (
    <section className="sx-instrument" aria-labelledby="sx-instrument-title">
      <div className="sx-brief">
        <span className="sx-kicker">نمای عملیات امروز</span>
        <h2 id="sx-instrument-title">پرونده‌های فعال در مهلت</h2>
        <p>{faNum(active)} پرونده فعال؛ {faNum(pct)}٪ هنوز در مهلت تحویل‌اند.</p>
        <div className="sx-readouts">
          {readouts.map((r) => (
            <Link key={r.href} href={r.href} className="sx-readout" data-tone={r.tone}>
              <strong>{faNum(r.n)}</strong>
              <span>{r.label}</span>
              <small>{r.note}</small>
            </Link>
          ))}
        </div>
      </div>
      <div className="sx-gauge">
        <div className="sx-plinth" aria-hidden="true"><i /><i /><i /></div>
        <div className="sx-dial" role="img" aria-label={`${faNum(pct)} درصد پرونده‌های فعال در مهلت`}>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <linearGradient id="sx-arc-light" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#8e7342" />
                <stop offset=".6" stopColor="#d8bb7f" />
                <stop offset="1" stopColor="#f3e2bb" />
              </linearGradient>
            </defs>
            {Array.from({ length: 28 }, (_, i) => {
              const a = ((135 + (i * 270) / 27) * Math.PI) / 180;
              const r1 = i % 9 === 0 ? 92 : 95;
              return <line key={i} className="sx-tick" x1={100 + r1 * Math.cos(a)} y1={100 + r1 * Math.sin(a)} x2={100 + 99 * Math.cos(a)} y2={100 + 99 * Math.sin(a)} strokeWidth="1.2" />;
            })}
            <circle className="sx-arc-track" cx="100" cy="100" r="80" fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${sweep} 502.65`} transform="rotate(135 100 100)" />
            <circle className="sx-arc-value" cx="100" cy="100" r="80" fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(sweep * onTime).toFixed(2)} 502.65`} transform="rotate(135 100 100)" />
          </svg>
          <div className="sx-dial-center" aria-hidden="true">
            <span className="sx-figure">{faNum(pct)}٪</span>
            <span>در مهلت</span>
          </div>
        </div>
      </div>
    </section>
  );
}
