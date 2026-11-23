'use client';
import Link from 'next/link';
import useSWR from 'swr';
import { PULSE_STATE_LABELS, pulseErrorText, pulseSentence, type PulseStatus } from '@manage/shared';
import { fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AppIcon } from './AppIcon';

/** Tone of the Manage Pulse state for the m-tag palette. */
export const pulseTone = (s: Pick<PulseStatus, 'enabled' | 'state' | 'configured'>) =>
  !s.configured || !s.enabled ? 'mute' : s.state === 'active' ? 'ok' : s.state === 'unreachable' ? 'wait' : 'stop';

/**
 * One line about Manage Pulse for the system administrator's support desk, next to the daily
 * reports (spec section 26). Only with integration.manage; it links to the settings page.
 */
export function PulseStatusPanel({ data: given }: { data?: PulseStatus }) {
  const { can } = useAuth();
  const visible = can('integration.manage');
  const { data: fetched } = useSWR<PulseStatus>(visible && !given ? '/pulse/status' : null, fetcher, { refreshInterval: 30_000 });
  const s = given ?? fetched;
  if (!visible || !s) return null;
  const worker = s.workerSeenAt && Date.now() - Date.parse(s.workerSeenAt) < 3 * 60_000;
  const error = s.enabled && s.state !== 'active' ? pulseErrorText(s.lastErrorCode) : null;
  return (
    <section className="panel pulse-card" aria-label="وضعیت منیج پالس" data-testid="pulse-status">
      <div className="panel-head">
        <div className="pulse-line">
          <span className={`pulse-dot ${pulseTone(s)}`} aria-hidden="true" />
          <div><h2>منیج پالس</h2><p className="small" data-testid="pulse-sentence">{pulseSentence(s)}</p></div>
        </div>
        <span className={`m-tag ${pulseTone(s)}`}>{s.configured ? (s.enabled ? PULSE_STATE_LABELS[s.state] : 'خاموش') : 'تنظیم نشده'}</span>
      </div>
      {(error || (s.enabled && !worker) || !s.featureEnabled) && <div className="panel-body stack">
        {!s.featureEnabled && <p className="callout callout-amber small">منیج پالس روی این سرور خاموش است (PULSE_ENABLED). روشن کردن آن کار نصب است و با تأیید مالک انجام می‌شود.</p>}
        {error && <p className="callout callout-red small" role="alert">{error}</p>}
        {s.enabled && !worker && s.featureEnabled && <p className="callout callout-amber small">سرویس پالس روی سرور دیده نمی‌شود{s.workerSeenAt ? '' : ' (هنوز هیچ‌بار اجرا نشده)'}؛ سرویس «pulse» در docker compose باید روشن باشد.</p>}
      </div>}
      {!given && <div className="panel-body"><Link className="btn btn-sm" href="/settings/pulse"><AppIcon name="gear" />تنظیمات منیج پالس</Link></div>}
    </section>
  );
}
