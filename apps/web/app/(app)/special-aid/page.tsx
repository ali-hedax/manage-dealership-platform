'use client';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { toPersianDigits, type SpecialAidTodayEntry } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatJalali } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { AppIcon } from '@/components/AppIcon';
import { PlateText } from '@/components/Plate';
import { SpecialAidTabs } from '@/components/SpecialAid';

/** «کارهای امروز»: the operator's landing page, most urgent first; one row per vehicle. */
export default function SpecialAidToday() {
  const { me, can } = useAuth();
  const toast = useToast();
  const { data, error, mutate, isLoading } = useSWR<SpecialAidTodayEntry[]>(can('special_aid.read') ? '/special-aid/today' : null, fetcher, { refreshInterval: 120_000 });
  const [busy, setBusy] = useState(false);
  if (!can('special_aid.read')) return <div className="callout"><h1>پیگیری امداد ویژه</h1><p>برای این بخش مجوز ندارید.</p></div>;
  const urgent = data?.filter((e) => e.dossier.urgent).length ?? 0;
  async function refresh() {
    setBusy(true);
    try { const r = await api<Record<string, number>>('/special-aid/sync', { method: 'POST' }); toast(`${faNum(r.items ?? 0)} قطعهٔ تازه و ${faNum(r.statusChanges ?? 0)} تغییر وضعیت از گزارش‌های ثبت‌شده خوانده شد`); await mutate(); }
    catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  }
  return (
    <section className="desk" aria-labelledby="aid-today">
      <header className="desk-head">
        <div className="desk-hello">
          <h1 id="aid-today">کارهای امروز امداد ویژه</h1>
          <p className="desk-sub">{data ? `${faNum(data.length)} خودرو نیازمند پیگیری${urgent ? ` · ${faNum(urgent)} فوری` : ''}` : 'در حال خواندن…'}</p>
        </div>
        <p className="desk-kicker">{me.displayName}</p>
      </header>
      <SpecialAidTabs />
      <div className="desk-tools">
        <p className="desk-strip" role="note"><AppIcon name="calendar" /><b>اولویت:</b> قطعهٔ رسیده بی‌اطلاع، تماس عقب‌افتاده، بی‌پاسخ، تماس ده‌روزه، مهلت ۲۰/۳۰ روز، قول مراجعه.</p>
        {can('special_aid.operate') && <button type="button" className="btn btn-sm no-print" disabled={busy} onClick={() => void refresh()}>خواندن دوباره از گزارش‌های ثبت‌شده</button>}
      </div>
      {error && <p role="alert" className="m-error">فهرست خوانده نشد: {errorMessage(error)} <button type="button" className="m-btn-s" onClick={() => void mutate()}>تلاش دوباره</button></p>}
      {isLoading && !data && <p className="muted small" role="status">در حال خواندن…</p>}
      {data && !data.length && <p className="m-empty">امروز کاری منتظر شما نیست.</p>}
      {!!data?.length && (
        <section className="panel"><div className="panel-body">
          <div className="table-scroll"><table className="table static" data-testid="aid-today">
            <thead><tr><th>خودرو</th><th>شاسی</th><th>کار</th><th>مهلت</th><th>قطعه</th><th /></tr></thead>
            <tbody>{data.map(({ dossier: d, tasks }) => (
              <tr key={d.id}>
                <td><strong>{d.vehicle.model ?? 'خودرو'}</strong><div className="xs">{d.vehicle.customerName ?? '—'}</div>{d.vehicle.plate && <div className="xs"><PlateText value={d.vehicle.plate} /></div>}</td>
                <td className="small"><bdi dir="ltr" className="vin-text">{d.vin}</bdi></td>
                <td className="small">{tasks.map((t) => <div key={t.kind}>{t.urgent ? <span className="m-tag stop">فوری</span> : t.overdue ? <span className="m-tag wait">گذشته</span> : null} {t.label}</div>)}</td>
                <td className="small">{tasks[0] ? formatJalali(tasks[0].dueAt) : '—'}</td>
                <td className="small">{faNum(new Set(tasks.flatMap((t) => t.itemIds)).size)}</td>
                <td><Link className="btn btn-sm" href={`/special-aid/vehicles/${d.id}`}>باز کردن پرونده</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="xs muted">تماس‌ها برای هر خودرو یک‌جا ثبت می‌شوند و سابقهٔ هر قطعه جدا می‌ماند. شاسی کامل است؛ برای کپی روی آن دو بار کلیک کنید ({toPersianDigits('17')} نویسه).</p>
        </div></section>
      )}
    </section>
  );
}
