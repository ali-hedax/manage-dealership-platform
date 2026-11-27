'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MODULE_LABELS, ROLE_LABELS, buildMenu, isTechnicianOnly, menuItemActive, menuNumber, type MenuItem, type ModuleKey } from '@manage/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { visibleWorkspaces, workspaceHome } from '@/lib/workspaces';
import { AppIcon, type IconName } from './AppIcon';
import { BackLink } from './BackLink';
import { NotificationCenter } from './NotificationCenter';
import { PageActions } from './PageActions';
import { InstallButton } from './InstallApp';
import { ReleaseNotice, VersionChip } from './ReleaseNotice';

// App shell (slice S05, owner 2026-11-27): matte black side menu numbered ۰–۹ from buildMenu
// (packages/shared/src/navigation.ts), a top bar with the global search (Ctrl+K), reminders and
// the account menu, and a way back on every page. The control room switches to the dark space.

export function Shell({ children }: { children: ReactNode }) {
  const { me, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false), [mobile, setMobile] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => { const media = window.matchMedia('(max-width: 960px)'); const sync = () => setMobile(media.matches); sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync); }, []);
  useEffect(() => { if (!open || !mobile) return; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); menu.current?.focus(); } }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [open, mobile]);
  useEffect(() => { document.title = `${pageTitle(pathname)} | Manage by HEDAX`; setOpen(false); }, [pathname]);

  const technicianOnly = isTechnicianOnly(me.roles);
  const home = workspaceHome(me);
  const desks = visibleWorkspaces(me);
  const sections = buildMenu({
    roles: me.roles, permissions: me.permissions, isOwner: !!me.isOwner, home, desks: desks.map((w) => w.key),
    receptionActive: me.modules.some((m) => m.key === 'reception' && m.status === 'active'),
  });
  const [desk, ...groups] = sections[0]?.num === 0 ? sections : [{ num: 0, key: 'desk', label: '', icon: '', items: [] }, ...sections];
  const isActive = (i: MenuItem) => menuItemActive(i, pathname);
  const activeGroup = groups.find((g) => g.items.some(isActive))?.key ?? null;
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup);
  // Navigating keeps the group of the current page open (and only that one).
  useEffect(() => { setOpenGroup(activeGroup); }, [activeGroup]);
  const [compact, setCompact] = useState(false);
  useEffect(() => { try { setCompact(localStorage.getItem('manage-nav-compact') === '1'); } catch { /* storage unavailable */ } }, []);
  const toggleCompact = () => { const next = !compact; setCompact(next); try { localStorage.setItem('manage-nav-compact', next ? '1' : '0'); } catch { /* storage unavailable */ } };

  const link = (i: MenuItem, num?: number) => {
    const active = isActive(i);
    return <Link key={i.href + i.label} href={i.href} aria-current={active ? 'page' : undefined} title={compact ? i.label : undefined}>{num !== undefined ? <span className="nav-num" aria-hidden="true">{menuNumber(num)}</span> : <AppIcon name={i.icon as IconName} />}<span>{i.label}</span></Link>;
  };
  async function logout() { await api('/auth/logout', { method: 'POST' }).catch(() => {}); router.replace('/login'); }
  const back = backTarget(pathname, home, desks.length > 1);

  return (
    <div className={`shell app-shell${compact ? ' side-compact' : ''}`}>
      <a className="skip-link" href="#page-content">رفتن به محتوای صفحه</a>
      {open && mobile && <button type="button" className="nav-scrim" aria-label="بستن منو" onClick={() => { setOpen(false); menu.current?.focus(); }} />}
      <aside className={`sidebar app-side${open ? ' open' : ''}`} aria-label="منوی اصلی" inert={mobile && !open}>
        <Link href={home} className="brand-mark" aria-label="Manage by HEDAX، میز کار">
          <span className="brand-slashes" aria-hidden="true"><i /><i /></span>
          <span className="brand-word">Manage</span>
          <span className="brand-by">by <b>HEDAX</b></span>
        </Link>
        <nav className="side-nav" id="main-navigation" aria-label="بخش‌های منیج">
          {desk!.items.map((i, n) => link(i, n === 0 ? 0 : undefined))}
          {groups.map((g) => (
            <NavGroup key={g.key} id={g.key} num={g.num} label={g.label} open={!compact && openGroup === g.key} active={activeGroup === g.key}
              onToggle={() => { if (compact) { setCompact(false); setOpenGroup(g.key); } else setOpenGroup(openGroup === g.key ? null : g.key); }}>
              {g.items.map((i) => link(i))}
            </NavGroup>
          ))}
        </nav>
        {!technicianOnly && <button type="button" className="nav-compact" aria-pressed={compact} onClick={toggleCompact} title={compact ? 'باز کردن منو' : 'جمع کردن منو'}><AppIcon name={compact ? 'arrow-left' : 'arrow-right'} /><span>{compact ? 'باز کردن منو' : 'جمع کردن منو'}</span></button>}
        <div className="side-foot">{me.tenant.name}</div>
      </aside>
      <div className="main">
        <header className="app-top no-print">
          <button ref={menu} type="button" className="icon-btn menu-btn" aria-controls="main-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>
            <AppIcon name={open ? 'close' : 'menu'} /><span>منو</span>
          </button>
          {!technicianOnly && can('case.read') && <GlobalSearch />}
          <div className="top-end">
            <VersionChip />
            <span className="top-tenant" title="نمایندگی">{me.tenant.name}</span>
            <NotificationCenter />
            <details className="account-menu">
              <summary aria-label={`حساب ${me.displayName}`}><span className="avatar" aria-hidden="true">{initials(me.displayName)}</span><span className="who">{me.displayName}</span><AppIcon name="chevron-down" className="chev" /></summary>
              <div className="account-pop" role="group" aria-label="حساب کاربری">
                <div className="account-head"><strong>{me.displayName}</strong><span>{me.isOwner ? 'مالک سامانه' : me.roles.map((r) => ROLE_LABELS[r]).join('، ')}</span><span>{me.tenant.name}</span></div>
                <Link href="/reminders">فیدبک‌های من</Link>
                <InstallButton />
                <button type="button" className="m-btn2-s" onClick={logout}><AppIcon name="logout" />خروج</button>
              </div>
            </details>
          </div>
        </header>
        {me.environment !== 'production' && <div className="env-banner" role="note">نسخهٔ آزمایشی — داده‌های این محیط ساختگی‌اند و جای سامانه‌های رسمی را نمی‌گیرند.</div>}
        {/* Outside <main>: a page's own actions stay the only buttons in its content. */}
        <div className="release-slot"><ReleaseNotice /></div>
        <main className="page" id="page-content" tabIndex={-1}>
          {back && <BackLink href={back.href} label={back.label} />}
          <PageActions />
          {children}
        </main>
      </div>
    </div>
  );
}

/** A module heading of the side menu (accordion: the parent keeps one group open). */
function NavGroup({ id, num, label, open, active, onToggle, children }: { id: string; num: number; label: string; open: boolean; active: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={`nav-group${open ? ' open' : ''}${active ? ' active' : ''}`}>
      <button type="button" className="nav-group-head" aria-expanded={open} aria-controls={`nav-${id}`} onClick={onToggle} title={label}>
        <span className="nav-num" aria-hidden="true">{menuNumber(num)}</span><span>{label}</span><AppIcon name="chevron-down" className="chev" />
      </button>
      {open && <div className="nav-group-items" id={`nav-${id}`} role="group" aria-label={label}>{children}</div>}
    </div>
  );
}

/**
 * Every page has a way back (spec §12; slice S05 «هر صفحه دکمهٔ بازگشت»): a folder goes back to its
 * list, a settings page to the settings, everything else to the own desk. Only the own desk itself
 * and the pages that draw their own back link (case folder, feedback, people report) get none here.
 */
export function backTarget(pathname: string, home: string, canChooseDesk = false): { href: string; label: string } | null {
  if (pathname === home) return null;
  if (pathname === '/reminders' || pathname === '/reports/people' || /^\/cases\/(?!new$|import$|deleted$)[^/]+$/.test(pathname)) return null;
  if (canChooseDesk && /^\/accidents\/[^/]+$/.test(pathname)) return { href: '/launch', label: 'بازگشت به انتخاب میزکار' };
  if (/^\/special-aid\/vehicles\/[^/]+$/.test(pathname)) return { href: '/special-aid/vehicles', label: 'بازگشت به پرونده خودروها' };
  if (/^\/reception\/stoppage\/[^/]+$/.test(pathname)) return { href: '/reception/stoppage', label: 'بازگشت به خودروهای متوقف' };
  if (pathname === '/control-room/stoppages') return { href: '/control-room', label: 'بازگشت به اتاق کنترل' };
  if (/^\/reception\/(?!open$|released$|night$|stoppage$)[^/]+$/.test(pathname)) return { href: '/reception/open', label: 'بازگشت به پذیرش‌ها' };
  const edit = /^\/cases\/([^/]+)\/edit$/.exec(pathname);
  if (edit) return { href: `/cases/${edit[1]}`, label: 'بازگشت به پرونده' };
  if (['/users', '/settings/reports', '/settings/pulse', '/settings/nexus', '/workshop/settings', '/reference-data', '/daily-reports'].includes(pathname)) return { href: '/settings', label: 'بازگشت به تنظیمات' };
  return { href: home, label: 'بازگشت به میز کار' };
}

const PAGE_TITLES: [RegExp, string][] = [[/^\/reception\/stoppage\/[^/]+$/, 'خودروی متوقف'], [/^\/reception\/stoppage$/, 'خودروهای متوقف'], [/^\/control-room\/stoppages$/, 'گزارش خودروهای متوقف'],[/^\/reception\/open$/, 'پذیرش‌های باز'], [/^\/reception\/released$/, 'ترخیص‌شده‌ها'], [/^\/reception\/[^/]+$/, 'پروندهٔ پذیرش'], [/^\/reception$/, 'پذیرش‌های امروز'], [/^\/settings\/pulse/, 'منیج پالس'], [/^\/special-aid\/vehicles\/[^/]+/, 'پروندهٔ امداد ویژه'], [/^\/special-aid\/vehicles/, 'پرونده خودروها'], [/^\/special-aid\/supply/, 'پیگیری تأمین قطعات'], [/^\/special-aid\/reports/, 'گزارش‌های امداد ویژه'], [/^\/special-aid\/feedback/, 'بازخورد فنی و تذکر'], [/^\/special-aid/, 'کارهای امروز امداد ویژه'], [/^\/launch$/, 'انتخاب میز کار'], [/^\/control-room/, 'اتاق کنترل'], [/^\/parts/, 'میز قطعات'], [/^\/settings\/reports/, 'مرکز گزارش‌های کسب‌وکار'], [/^\/settings/, 'تنظیمات'], [/^\/$/, 'داشبورد'], [/^\/workshop\/settings/, 'تقویم و جایگاه‌ها'], [/^\/workshop\/technician/, 'کارهای من'], [/^\/workshop/, 'برنامه و گزارش تعمیر'], [/^\/accidents/, 'میز کار'], [/^\/cases\/new/, 'پذیرش خودرو'], [/^\/cases\/import/, 'ورود خودروها از اکسل'], [/^\/cases\/[^/]+/, 'پوشهٔ پرونده'], [/^\/cases/, 'پرونده‌ها'], [/^\/reports/, 'گزارش‌ها'], [/^\/daily-reports/, 'گزارش‌های روزانه'], [/^\/stock/, 'موجودی روزانه و رزرو'], [/^\/emdad/, 'پیگیری امداد ویژه'], [/^\/users/, 'کارکنان'], [/^\/reference-data/, 'اطلاعات پایه'], [/^\/reminders/, 'فیدبک‌ها']];
/** Browser tab title for each area, so several open tabs can be told apart. */
export function pageTitle(pathname: string): string {
  const module = /^\/modules\/([^/]+)/.exec(pathname)?.[1];
  if (module) return MODULE_LABELS[module as ModuleKey] ?? 'واحدها';
  return PAGE_TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Manage';
}

/** First letters of the first two words of a display name, for the avatar. */
export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('‌') || '؟';
}

/** Search from any page: plate, name, case or admission number. Opens the filtered case list. Ctrl+K (or "/") focuses it. */
function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !e.ctrlKey && !e.metaKey && !t.closest('input,textarea,select,[contenteditable="true"]'))) { e.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <form role="search" className="global-search top-search" onSubmit={(e) => { e.preventDefault(); const v = q.trim(); if (!v) return; router.push(`/cases?q=${encodeURIComponent(v)}`); setQ(''); }}>
      <label className="sr-only" htmlFor="global-search">جست‌وجوی سریع از هر صفحه</label>
      <AppIcon name="search" />
      <input ref={input} id="global-search" type="search" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی پرونده، پلاک یا نام مشتری…" autoComplete="off" />
      <kbd aria-hidden="true">Ctrl K</kbd>
    </form>
  );
}
