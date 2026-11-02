'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { MODULE_LABELS, ROLE_LABELS } from '@manage/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function Shell({ children }: { children: ReactNode }) {
  const { me, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const nav = [
    { href: '/', label: 'داشبورد', show: can('dashboard.read') },
    { href: '/cases', label: 'پرونده‌های تصادفی', show: can('case.read') },
    { href: '/cases/new', label: 'ثبت پرونده', show: can('case.create') },
    {
      href: '/reports',
      label: 'گزارش‌ها',
      show: can('report.manager') || can('part.manage') || can('case.update') || can('task.manage') || can('qc.inspect'),
    },
    { href: '/users', label: 'کارکنان', show: can('user.manage') },
  ];
  const current = (href: string) =>
    href === '/' ? pathname === '/' : href === '/cases' ? pathname === '/cases' || /^\/cases\/(?!new)/.test(pathname) : pathname.startsWith(href);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  }

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="منوی اصلی">
        <div className="brand">
          <img src="/brand/logo-dark.png" alt="Manage by HEDAX" width={132} height={44} />
          <div className="tenant">{me.tenant.name}</div>
        </div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <Link key={n.href} href={n.href} aria-current={current(n.href) ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          <div className="group">ماژول‌های بعدی</div>
          {me.modules
            .filter((m) => m.status === 'planned')
            .map((m) => (
              <Link
                key={m.key}
                href={`/modules/${m.key}`}
                className="planned"
                aria-current={pathname === `/modules/${m.key}` ? 'page' : undefined}
              >
                <span>{MODULE_LABELS[m.key]}</span>
                <span className="tag-dev">در دست توسعه</span>
              </Link>
            ))}
        </nav>
        <div className="account">
          <div className="name">{me.displayName}</div>
          <div className="xs">{me.roles.map((r) => ROLE_LABELS[r]).join('، ')}</div>
          <div className="sync" title="همگام‌سازی سرور محلی و ابری پس از نصب روی شبکه نمایندگی فعال می‌شود">
            <i aria-hidden /> همگام‌سازی محلی: هنوز فعال نشده
          </div>
          <button type="button" className="btn btn-sm" onClick={logout}>
            خروج
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <img src="/brand/logo-dark.png" alt="Manage by HEDAX" width={104} height={35} />
          <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            منو
          </button>
        </div>
        {me.environment !== 'production' && (
          <div className="env-banner" role="note">
            نسخه آزمایشی — داده‌های این محیط ساختگی‌اند و جای سامانه‌های رسمی را نمی‌گیرند.
          </div>
        )}
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
