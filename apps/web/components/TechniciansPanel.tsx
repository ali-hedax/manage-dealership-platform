'use client';
import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { nextTechnicianUsername, REPAIR_TRADE_LABELS, type RepairTrade, type WorkshopStation } from '@manage/shared';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatJalali, toPersianDigits } from '@/lib/format';

type Technician = { id: string; username: string; displayName: string; isActive: boolean; hasPin: boolean; locked: boolean; lastLoginAt: string | null; station: { code: string; name: string; trade: RepairTrade } | null };
// Units in the order the workshop names them: صافکار، نقاش، جلوبندی‌کار، باتری‌ساز، مکانیک.
const UNITS: RepairTrade[] = ['body', 'paint', 'suspension', 'electrical', 'mechanical', 'engine_tuning'];
type Pending = { tech: Technician; kind: 'pin' | 'active' };
const PIN = '[0-9۰-۹]{4}';
const toLatinDigits = (v: string) => v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** Technician accounts: a name and a 4-digit PIN; Manage picks the username (tech01, tech02, …). */
export function TechniciansPanel() {
  const { can, me } = useAuth();
  // A system administrator who is not the owner writes a reason: a new PIN also unlocks the account.
  const support = !me.isOwner && me.roles.includes('system_admin');
  const { data, mutate } = useSWR<Technician[]>(can('user.manage') ? '/staff/technicians' : null, fetcher);
  // Free bays of the chosen unit are offered as suggestions; any new code creates the bay.
  const { data: stations, mutate: refreshStations } = useSWR<WorkshopStation[]>(can('user.manage') && can('workshop.read') ? '/workshop/stations' : null, fetcher);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [created, setCreated] = useState<{ name: string; username: string; pin: string; bay: string } | null>(null), [message, setMessage] = useState('');
  const [trade, setTrade] = useState<RepairTrade | ''>(''), [stationCode, setStationCode] = useState('');
  const [name, setName] = useState(''), [pin, setPin] = useState(''), [username, setUsername] = useState(''), [editUsername, setEditUsername] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  if (!can('user.manage')) return null;
  const suggested = nextTechnicianUsername((data ?? []).map((t) => t.username));
  const chosenUsername = (editUsername ? username.trim().toLowerCase() : '') || suggested;
  const freeBays = (stations ?? []).filter((st) => st.trade === trade && st.isActive && !st.responsibleUserId);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    setCreated(null);
    try {
      await fn();
      await mutate();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trade) return;
    const account = { displayName: name.trim(), username: chosenUsername, pin: toLatinDigits(pin), trade, stationCode: stationCode.trim() };
    if (await run(() => api('/staff/technicians', { body: account }))) {
      setCreated({ name: account.displayName, username: account.username, pin: account.pin, bay: `${REPAIR_TRADE_LABELS[trade]} · ${account.stationCode}` });
      void refreshStations();
      setName('');
      setPin('');
      setStationCode('');
      setUsername('');
      setEditUsername(false);
    }
  }
  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pending) return;
    const fd = new FormData(e.currentTarget), reason = String(fd.get('reason') ?? '').trim(), t = pending.tech;
    const extra = reason ? { reason } : {};
    const ok =
      pending.kind === 'pin'
        ? await run(() => api(`/staff/technicians/${t.id}/pin`, { method: 'PUT', body: { pin: toLatinDigits(String(fd.get('pin') ?? '')), ...extra } }))
        : await run(() => api(`/staff/technicians/${t.id}/active`, { method: 'PUT', body: { active: !t.isActive, ...extra } }));
    if (ok) {
      setMessage(pending.kind === 'pin' ? `رمز تازهٔ ${t.displayName} ثبت شد و ورودهای قبلی او بسته شد.` : t.isActive ? `${t.displayName} غیرفعال شد.` : `${t.displayName} فعال شد.`);
      setPending(null);
    }
  }
  // The owner deactivates or re-activates in one tap; a system administrator first writes a reason.
  function toggleActive(t: Technician) {
    if (support) setPending({ tech: t, kind: 'active' });
    else void run(() => api(`/staff/technicians/${t.id}/active`, { method: 'PUT', body: { active: !t.isActive } })).then((ok) => ok && setMessage(t.isActive ? `${t.displayName} غیرفعال شد.` : `${t.displayName} فعال شد.`));
  }

  return (
    <section className="card technicians" aria-labelledby="technicians-title">
      <h2 id="technicians-title">تعمیرکارها</h2>
      <p className="muted small">تعمیرکار ایمیل لازم ندارد. نام، واحد، کد جایگاه و یک رمز ۴ رقمی بدهید؛ منیج نام کاربری را می‌سازد. تعمیرکار با نام کاربری و رمز در زبانهٔ «تعمیرکار» صفحهٔ ورود وارد می‌شود و فقط کارهای خودش را می‌بیند.</p>

      <form onSubmit={create} className="technician-form">
        <label className="field">
          <span>نام تعمیرکار</span>
          <input name="displayName" className="input" required minLength={2} maxLength={120} placeholder="مثلاً رضا حسینی" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>واحد</span>
          <select name="trade" className="input" required value={trade} onChange={(e) => setTrade(e.target.value as RepairTrade)}>
            <option value="" disabled>انتخاب کنید</option>
            {UNITS.map((u) => <option key={u} value={u}>{REPAIR_TRADE_LABELS[u]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>کد جایگاه</span>
          <input name="stationCode" className="input ltr-input" required maxLength={32} placeholder="B-01" list="technician-free-bays" value={stationCode} onChange={(e) => setStationCode(e.target.value)} />
          <datalist id="technician-free-bays">{freeBays.map((st) => <option key={st.id} value={st.code}>{st.name}</option>)}</datalist>
        </label>
        <label className="field">
          <span>رمز ۴ رقمی</span>
          <input name="pin" className="input ltr-input" inputMode="numeric" required pattern={PIN} maxLength={4} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        <div className="field">
          <span>نام کاربری</span>
          {editUsername ? (
            <input name="username" aria-label="نام کاربری" className="input ltr-input" pattern="[A-Za-z][A-Za-z0-9._\-]{2,31}" title="با حرف انگلیسی شروع شود؛ ۳ تا ۳۲ حرف یا عدد" placeholder={suggested} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          ) : (
            <span className="technician-username">
              <bdi dir="ltr">{suggested}</bdi>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditUsername(true)}>تغییر</button>
            </span>
          )}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'در حال ساخت…' : 'افزودن تعمیرکار'}</button>
      </form>

      {created && (
        <div role="status" className="callout technician-created">
          <strong>{created.name} ساخته شد.</strong> این دو را حضوری به خودش بدهید:
          <span className="technician-credentials">
            <span>نام کاربری: <bdi dir="ltr">{created.username}</bdi></span>
            <span>رمز: <bdi dir="ltr">{toPersianDigits(created.pin)}</bdi></span>
            <span>جایگاه: <bdi>{created.bay}</bdi></span>
          </span>
        </div>
      )}
      {message && <p role="status" className="callout">{message}</p>}
      {error && <p role="alert" className="callout callout-red">{error}</p>}

      {pending && (
        <form onSubmit={confirm} className="callout technician-confirm">
          <strong>{pending.kind === 'pin' ? `رمز تازه برای ${pending.tech.displayName}` : `${pending.tech.isActive ? 'غیرفعال کردن' : 'فعال کردن'} ${pending.tech.displayName}`}</strong>
          {pending.kind === 'pin' && (
            <label className="field">
              <span>رمز تازهٔ ۴ رقمی</span>
              <input name="pin" className="input ltr-input" inputMode="numeric" required pattern={PIN} maxLength={4} autoComplete="off" autoFocus />
            </label>
          )}
          {support && (
            <label className="field">
              <span>دلیل (در گزارش مالک دیده می‌شود)</span>
              <input name="reason" className="input" required maxLength={300} placeholder="مثلاً رمز را فراموش کرده بود" autoFocus={pending.kind === 'active'} />
            </label>
          )}
          <span className="technician-confirm-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{pending.kind === 'pin' ? 'ثبت رمز تازه' : 'تأیید'}</button>
            <button type="button" className="btn" onClick={() => setPending(null)}>انصراف</button>
          </span>
        </form>
      )}

      <div className="table-scroll">
        <table className="table">
          <thead><tr><th scope="col">نام</th><th scope="col">جایگاه</th><th scope="col">نام کاربری</th><th scope="col">وضعیت</th><th scope="col">آخرین ورود</th><th scope="col">اقدام</th></tr></thead>
          <tbody>
            {data?.map((t) => (
              <tr key={t.id}>
                <th scope="row">{t.displayName}</th>
                <td>{t.station ? <>{REPAIR_TRADE_LABELS[t.station.trade] ?? t.station.trade} · <bdi dir="ltr">{t.station.code}</bdi></> : <span className="muted">—</span>}</td>
                <td><bdi dir="ltr">{t.username}</bdi></td>
                <td><span className={`chip ${!t.isActive ? '' : t.locked ? 'chip-red' : !t.hasPin ? 'chip-amber' : 'chip-green'}`}>{!t.isActive ? 'غیرفعال' : t.locked ? 'قفل موقت' : !t.hasPin ? 'بدون رمز' : 'فعال'}</span></td>
                <td>{t.lastLoginAt ? formatJalali(t.lastLoginAt, { time: true }) : '—'}</td>
                <td className="technician-actions">
                  <button type="button" className="btn btn-sm" disabled={busy} aria-label={`رمز تازه برای ${t.displayName}`} onClick={() => setPending({ tech: t, kind: 'pin' })}>رمز تازه</button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => toggleActive(t)}>{t.isActive ? 'غیرفعال کردن' : 'فعال کردن'}</button>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={6} className="muted">هنوز تعمیرکاری ساخته نشده است.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
