'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError, errorMessage } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [needTenant, setNeedTenant] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailEnabled,setEmailEnabled] = useState(false);
  const [challenge,setChallenge] = useState<{challengeId:string;proof:string}|null>(null);
  const [code,setCode] = useState('');
  useEffect(()=>{api<{totpEnabled:boolean}>('/auth/options').then(x=>setEmailEnabled(x.totpEnabled)).catch(()=>{});},[]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (emailEnabled && !challenge) {
        const step=await api<{challengeId:string;proof:string}>('/auth/email/login',{body:{email:username.trim().toLowerCase(),password}});
        setChallenge(step);setPassword('');setBusy(false);return;
      }
      if (challenge) {
        await api('/auth/email/verify',{body:{...challenge,code}});
      } else {
      await api('/auth/login', {
        body: { username: username.trim(), password, tenantCode: tenantCode.trim() || undefined },
      });
      }
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') && !/[\\\r\n]/.test(next) ? next : '/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TENANT_REQUIRED') setNeedTenant(true);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div>
        <h1>ورود به Manage</h1>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          {challenge ? 'کد شش‌رقمی حساب Manage را از برنامهٔ Google Authenticator وارد کنید.' : emailEnabled ? 'با ایمیل و رمز شخصی وارد شوید؛ سپس کد Google Authenticator را وارد می‌کنید.' : 'با نام کاربری و رمز عبوری که مدیر سیستم به شما داده است وارد شوید.'}
        </p>
      </div>
      {!emailEnabled && needTenant && (
        <label className="field">
          <span>کد نمایندگی</span>
          <input
            className="input ltr-input"
            value={tenantCode}
            onChange={(e) => setTenantCode(e.target.value)}
            autoComplete="organization"
          />
        </label>
      )}
      {!challenge && <><label className="field">
        <span>{emailEnabled?'ایمیل':'نام کاربری'}</span>
        <input
          className="input ltr-input"
          name="username"
          type={emailEnabled?'email':'text'}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
        />
      </label>
      <label className="field">
        <span>رمز عبور</span>
        <input
          className="input ltr-input"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label></>}
      {challenge && <label className="field"><span>کد تأیید</span><input className="input ltr-input" name="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/\D/g,''))} maxLength={6} pattern="[0-9]{6}" required autoFocus /></label>}
      {error && (
        <div className="callout callout-red" role="alert">
          {error}
        </div>
      )}
      <button className="btn btn-primary" type="submit" disabled={busy || (challenge ? code.length!==6 : !username || !password)}>
        {busy ? 'در حال ورود…' : challenge ? 'تأیید کد و ورود' : emailEnabled?'ادامه':'ورود'}
      </button>
      {challenge && <><p className="small muted">کد در برنامه هر ۳۰ ثانیه عوض می‌شود. اگر کد قبلی را استفاده کرده‌اید، منتظر کد تازه بمانید.</p><button className="btn" type="button" onClick={()=>{setChallenge(null);setCode('');setError('');}}>بازگشت به ایمیل و رمز</button></>}
      {emailEnabled && !challenge && <Link className="small" href="/reset-password">رمزم را فراموش کرده‌ام</Link>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login">
      <div className="side">
        <img src="/brand/logo-dark.png" alt="Manage by HEDAX" width={190} height={63} />
        <div className="claim">هر خودرو، هر مرحله و هر مانع در یک نگاه.</div>
        <div className="xs" style={{ color: '#a0aec0' }}>
          سامانه مدیریت عملیات نمایندگی، ماژول خودروهای تصادفی
        </div>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
