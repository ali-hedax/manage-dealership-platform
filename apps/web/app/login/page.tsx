'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', {
        body: { username: username.trim(), password, tenantCode: tenantCode.trim() || undefined },
      });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TENANT_REQUIRED') setNeedTenant(true);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div>
        <h1>ورود به Manage</h1>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          با نام کاربری و رمز عبوری که مدیر سیستم به شما داده است وارد شوید.
        </p>
      </div>
      {needTenant && (
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
      <label className="field">
        <span>نام کاربری</span>
        <input
          className="input ltr-input"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
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
      </label>
      {error && (
        <div className="callout callout-red" role="alert">
          {error}
        </div>
      )}
      <button className="btn btn-primary" type="submit" disabled={busy || !username || !password}>
        {busy ? 'در حال ورود…' : 'ورود'}
      </button>
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
