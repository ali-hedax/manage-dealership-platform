'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError, errorMessage } from '@/lib/api';
import type {Me} from '@manage/shared';
import {InstallButton} from '@/components/InstallApp';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword,setShowPassword]=useState(false);
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
        await api<Me>('/auth/email/verify',{body:{...challenge,code}});
      } else {
      await api<Me>('/auth/login', {
        body: { username: username.trim(), password, tenantCode: tenantCode.trim() || undefined },
      });
      }
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') && !/[\\\r\n]/.test(next) ? next : '/launch');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TENANT_REQUIRED') setNeedTenant(true);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div>
        <h1>{challenge ? 'تأیید ورود' : 'ورود به حساب کاری'}</h1>
        <p className="muted small" style={{ margin: '6px 0 0' }}>
          {challenge ? 'کد شش‌رقمی حساب Manage را از برنامهٔ Google Authenticator وارد کنید.' : emailEnabled ? 'با ایمیل کاری و رمز شخصی وارد شوید.' : 'با نام کاربری و رمز عبوری که مدیر سیستم به شما داده است وارد شوید.'}
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
        <span>{emailEnabled?'ایمیل کاری':'نام کاربری'}</span>
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
      <div className="field">
        <label htmlFor="login-password">رمز عبور</label>
        <div className="password-field">
          <input
            id="login-password"
            className="input ltr-input"
            name="password"
            type={showPassword?'text':'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="button" className="password-toggle" aria-label={showPassword?'پنهان کردن رمز':'نمایش رمز'} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)}>
            {showPassword
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>}
          </button>
        </div>
        {emailEnabled && <Link className="small forgot-link" href="/reset-password">رمز را فراموش کرده‌اید؟</Link>}
      </div></>}
      {challenge && <label className="field"><span>کد تأیید</span><input className="input ltr-input" name="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/\D/g,''))} maxLength={6} pattern="[0-9]{6}" required autoFocus /></label>}
      {error && (
        <div className="callout callout-red" role="alert">
          {error}
        </div>
      )}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'در حال ورود…' : challenge ? 'تأیید کد و ورود' : emailEnabled?'ادامه':'ورود'}
      </button>
      {emailEnabled && !challenge && <p className="login-2fa"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>در مرحلهٔ بعد، کد Google Authenticator خواسته می‌شود.</p>}
      {challenge && <><p className="small muted">کد در برنامه هر ۳۰ ثانیه عوض می‌شود. اگر کد قبلی را استفاده کرده‌اید، منتظر کد تازه بمانید.</p><button className="btn" type="button" onClick={()=>{setChallenge(null);setCode('');setError('');}}>بازگشت به ایمیل و رمز</button></>}
      {!challenge&&<div className="install-login"><InstallButton/></div>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login entry-login">
      <div className="side">
        <img src="/brand/manage-logo-dark.svg" alt="Manage by HEDAX" width={190} height={48} />
        <div className="entry-story">
          <div className="claim">از پذیرش<br/>تا تحویل،<br/>با دید روشن.</div>
          <p>سامانهٔ یکپارچهٔ مدیریت عملیات نمایندگی‌های خودرو</p>
          <ol className="entry-route"><li><b>01</b>پذیرش و کارشناسی</li><li><b>02</b>تأمین و تعمیر</li><li><b>03</b>کنترل و تحویل</li></ol>
        </div>
        <p className="entry-signature"><span>محصولی از هداکس</span><span className="entry-signature-mark">HEDAX</span></p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
