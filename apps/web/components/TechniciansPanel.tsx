'use client';
import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { api, errorMessage, fetcher } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatJalali } from '@/lib/format';

type Technician = { id: string; username: string; displayName: string; isActive: boolean; hasPin: boolean; locked: boolean; lastLoginAt: string | null };

/** Technician accounts: username + 4-digit PIN, no email or Authenticator. */
export function TechniciansPanel() {
  const { can } = useAuth();
  const { data, mutate } = useSWR<Technician[]>(can('user.manage') ? '/staff/technicians' : null, fetcher);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [pinFor, setPinFor] = useState<Technician | null>(null);
  if (!can('user.manage')) return null;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await mutate();
      setMessage(ok);
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
    const form = e.currentTarget, fd = new FormData(form);
    const done = await run(
      () => api('/staff/technicians', { body: { displayName: fd.get('displayName'), username: fd.get('username'), pin: fd.get('pin') } }),
      'تعمیرکار ساخته شد. نام کاربری و رمز را حضوری به خودش بدهید.',
    );
    if (done) form.reset();
  }
  async function resetPin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pin = new FormData(e.currentTarget).get('pin');
    if (await run(() => api(`/staff/technicians/${pinFor!.id}/pin`, { method: 'PUT', body: { pin } }), `رمز تازهٔ ${pinFor!.displayName} ثبت شد و ورودهای قبلی او بسته شد.`)) setPinFor(null);
  }

  return (
    <section className="card" style={{ marginBlockStart: 24 }} aria-labelledby="technicians-title">
      <h2 id="technicians-title">تعمیرکاران</h2>
      <p className="muted small">تعمیرکار ایمیل و Authenticator ندارد؛ با نام کاربری و رمز ۴ رقمی وارد می‌شود و فقط کارتابل خودش را می‌بیند. با ۵ بار رمز اشتباه، ۱۵ دقیقه قفل می‌شود.</p>
      {message && <p role="status" className="callout">{message}</p>}
      {error && <p role="alert" className="callout callout-red">{error}</p>}
      <form onSubmit={create} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <label className="field" style={{ flex: '1 1 200px' }}>نام تعمیرکار<input name="displayName" className="input" required minLength={2} maxLength={120} placeholder="مثلاً رضا حسینی" /></label>
        <label className="field" style={{ flex: '1 1 160px' }}>نام کاربری<input name="username" className="input" dir="ltr" required pattern="[A-Za-z][A-Za-z0-9._\-]{2,31}" title="با حرف انگلیسی شروع شود؛ ۳ تا ۳۲ حرف یا عدد" placeholder="safkar2" /></label>
        <label className="field" style={{ flex: '0 1 120px' }}>رمز ۴ رقمی<input name="pin" className="input" dir="ltr" inputMode="numeric" required pattern="[0-9۰-۹]{4}" maxLength={4} autoComplete="off" /></label>
        <button type="submit" className="btn btn-primary" disabled={busy}>افزودن تعمیرکار</button>
      </form>
      {pinFor && (
        <form onSubmit={resetPin} className="callout" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginBlockStart: 16 }}>
          <label className="field" style={{ flex: '0 1 160px' }}>رمز تازهٔ {pinFor.displayName}<input name="pin" className="input" dir="ltr" inputMode="numeric" required pattern="[0-9۰-۹]{4}" maxLength={4} autoComplete="off" autoFocus /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>ثبت رمز تازه</button>
          <button type="button" className="btn" onClick={() => setPinFor(null)}>انصراف</button>
        </form>
      )}
      <div className="table-scroll" style={{ marginBlockStart: 16 }}>
        <table className="table">
          <thead><tr><th scope="col">نام</th><th scope="col">نام کاربری</th><th scope="col">وضعیت</th><th scope="col">آخرین ورود</th><th scope="col">اقدام</th></tr></thead>
          <tbody>
            {data?.map((t) => (
              <tr key={t.id}>
                <th scope="row">{t.displayName}</th>
                <td dir="ltr" style={{ textAlign: 'right' }}>{t.username}</td>
                <td>{!t.isActive ? 'غیرفعال' : t.locked ? 'قفل موقت' : !t.hasPin ? 'بدون رمز' : 'فعال'}</td>
                <td>{t.lastLoginAt ? formatJalali(t.lastLoginAt, { time: true }) : '—'}</td>
                <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setPinFor(t)}>رمز تازه</button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => api(`/staff/technicians/${t.id}/active`, { method: 'PUT', body: { active: !t.isActive } }), t.isActive ? `${t.displayName} غیرفعال شد.` : `${t.displayName} فعال شد.`)}>
                    {t.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
                  </button>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && <tr><td colSpan={5} className="muted">هنوز تعمیرکاری با رمز ۴ رقمی ساخته نشده است.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
