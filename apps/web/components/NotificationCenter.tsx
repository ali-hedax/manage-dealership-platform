'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS, NOTIFICATION_STATE_LABELS, notificationBadge, type AppNotification, type ReceivedReminder } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { formatJalali } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { AppIcon } from './AppIcon';

type Inbox = { unread: number; badge?: number; items: AppNotification[] };
type Filter = (typeof NOTIFICATION_CATEGORIES)[number] | 'all';

/**
 * One notification center for every workspace (spec section 25): a compact bell in the top bar
 * instead of banners above each page. Reading («خواندم») and completing («انجام شد») are separate;
 * urgent items stay in the counter until completed. Reminders between colleagues keep their page.
 */
export function NotificationCenter() {
  const toast = useToast();
  const { data, mutate } = useSWR<Inbox>('/notifications', fetcher, { refreshInterval: 60_000 });
  const { data: inbox } = useSWR<ReceivedReminder[]>('/reminders/inbox', fetcher, { refreshInterval: 60_000 });
  const [open, setOpen] = useState(false), [filter, setFilter] = useState<Filter>('all'), [history, setHistory] = useState(false);
  const box = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('mousedown', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); };
  }, [open]);
  const items = data?.items ?? [];
  const reminders = inbox?.filter((r) => r.status === 'sent').length ?? 0;
  const badge = (data?.badge ?? notificationBadge(items)) + reminders;
  const shown = items.filter((n) => (history ? n.resolvedAt : !n.resolvedAt) && (filter === 'all' || (filter === 'urgent' ? n.urgent : n.category === filter)));
  async function post(path: string, ids: string[]) { try { await mutate(await api<Inbox>(path, { body: { ids } }), { revalidate: false }); } catch (e) { toast(errorMessage(e), 'error'); } }
  const count = (f: Filter) => items.filter((n) => !n.resolvedAt && (f === 'all' || (f === 'urgent' ? n.urgent : n.category === f))).length;
  return (
    <div className="notice-center" ref={box}>
      <button ref={button} type="button" className="icon-btn bell" aria-expanded={open} aria-controls="notice-panel" aria-label={badge ? `اعلان‌ها، ${badge.toLocaleString('fa-IR')} مورد باز` : 'اعلان‌ها'} onClick={() => setOpen(!open)}>
        <AppIcon name="bell" />{badge > 0 && <span className="dot" aria-hidden="true" />}
      </button>
      {open && <section id="notice-panel" className="notice-panel" aria-label="مرکز اعلان‌ها" data-testid="notifications">
        <header className="notice-panel-head"><strong>اعلان‌ها</strong><button type="button" className="btn btn-sm btn-ghost" onClick={() => setHistory(!history)}>{history ? 'اعلان‌های باز' : 'انجام‌شده‌ها'}</button></header>
        {!history && <div className="segmented" role="group" aria-label="دسته‌بندی اعلان‌ها">
          {(['all', ...NOTIFICATION_CATEGORIES] as Filter[]).filter((f) => f === 'all' || count(f) > 0).map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'همه' : NOTIFICATION_CATEGORY_LABELS[f]} {count(f).toLocaleString('fa-IR')}</button>)}
        </div>}
        <ul className="notice-list">{shown.map((n) => (
          <li key={n.id} className={`notice-item${n.readAt ? '' : ' unread'}${n.urgent && !n.resolvedAt ? ' urgent' : ''}`}>
            <div><strong>{n.title}</strong>{n.urgent && !n.resolvedAt && <span className="m-tag stop">فوری</span>} <span className="xs muted">{formatJalali(n.createdAt, { time: true })} · {NOTIFICATION_STATE_LABELS[n.state ?? (n.readAt ? 'open' : 'unread')]}</span>{n.body && <p className="small">{n.body}</p>}</div>
            {!n.resolvedAt && <div className="row">
              {n.link && <Link className="btn btn-sm" href={n.link} onClick={() => { setOpen(false); if (!n.readAt) void post('/notifications/read', [n.id]); }}>رفتن به بخش مربوط</Link>}
              {!n.readAt && <button type="button" className="btn btn-sm btn-ghost" onClick={() => void post('/notifications/read', [n.id])}>خواندم</button>}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void post('/notifications/resolve', [n.id])}>انجام شد</button>
            </div>}
          </li>
        ))}{!shown.length && <li className="muted small">{history ? 'هنوز اعلانی انجام نشده است.' : 'اعلان بازی نیست.'}</li>}</ul>
        <Link className="notice-panel-foot" href="/reminders" onClick={() => setOpen(false)}>فیدبک‌ها و تذکرهای همکاران{reminders ? ` (${reminders.toLocaleString('fa-IR')} تازه)` : ''}</Link>
      </section>}
    </div>
  );
}
