// Side menu 0–9 (slice S05; owner, 2026-11-27). One definition for the web shell and the tests.
// Every link is an existing route behind its existing permission; a section shows only when at
// least one of its links is allowed, so modules that do not exist yet (۳ سالن, ۷ مشتری و پیامک)
// stay hidden instead of half-built. The numbers are fixed: a hidden section leaves a gap.
// Unfinished modules follow the central switch (features.ts): closed ones disappear for everyone
// except the owner, and the owner sees them marked «آزمایشی».
import { featureOfPath, featureOpen, featureTagged } from './features';

export interface MenuContext {
  roles: readonly string[];
  permissions: Iterable<string>;
  isOwner: boolean;
  /** The person's own desk (workspaceHome). */
  home: string;
  /** Keys of the workspaces this person may open (visibleWorkspaces). */
  desks: readonly string[];
  /** «پذیرش و ترخیص» is active on the server (PULSE_ENABLED). */
  receptionActive: boolean;
  /** Modules the server opened to everyone (OPEN_FEATURES, /auth/me). */
  openFeatures?: readonly string[];
}

export interface MenuItem {
  href: string;
  label: string;
  icon: string;
  /** Whether a pathname belongs to this item (default: exact href). */
  match?: (pathname: string) => boolean;
  /** Owner only: the module is unfinished (features.ts) — show the «آزمایشی» tag. */
  experimental?: boolean;
}

export interface MenuSection {
  /** 0–9, shown in Persian digits before the label. */
  num: number;
  key: string;
  label: string;
  icon: string;
  items: MenuItem[];
}

export const MENU_SECTIONS = [
  { num: 0, key: 'desk', label: 'میزکار من', icon: 'nav-workspace' },
  { num: 1, key: 'reception', label: 'پذیرش و جست‌وجو', icon: 'file' },
  { num: 2, key: 'dispatch', label: 'تقسیم کار', icon: 'team' },
  { num: 3, key: 'floor', label: 'سالن', icon: 'wrench' },
  { num: 4, key: 'accident', label: 'تصادفات', icon: 'nav-car' },
  { num: 5, key: 'special_aid', label: 'امداد ویژه و نوبت', icon: 'truck' },
  { num: 6, key: 'parts', label: 'انبار و قطعات', icon: 'nav-package' },
  { num: 7, key: 'customer', label: 'مشتری و پیامک', icon: 'send' },
  { num: 8, key: 'manager', label: 'مدیر خدمات', icon: 'nav-chart' },
  { num: 9, key: 'settings', label: 'تنظیمات', icon: 'nav-settings' },
] as const;

export const TECHNICIAN_HOME = '/workshop/technician';

/** True when the person's only role is technician: the menu is just their own jobs. */
export const isTechnicianOnly = (roles: readonly string[]) => roles.length === 1 && roles[0] === 'technician';

export function buildMenu(ctx: MenuContext): MenuSection[] {
  const perms = new Set(ctx.permissions);
  const can = (p: string) => ctx.isOwner || perms.has(p);
  const { home } = ctx;
  const technicianOnly = isTechnicianOnly(ctx.roles);
  const manager = can('report.manager');
  const reports = can('report.manager') || can('part.manage') || can('case.update') || can('task.manage') || can('wage.report');
  const reception = ctx.receptionActive && can('reception.read');
  const desk = (key: string) => ctx.desks.includes(key);
  const items: Record<string, (MenuItem | false)[]> = technicianOnly
    ? { desk: [{ href: TECHNICIAN_HOME, label: 'میزکار من', icon: 'nav-workspace', match: (p) => p === TECHNICIAN_HOME }] }
    : {
        desk: [
          { href: home, label: 'میزکار من', icon: 'nav-workspace', match: (p) => p === home },
          ctx.desks.length > 1 && { href: '/launch', label: 'انتخاب میزکار', icon: 'desk' },
        ],
        reception: [
          reception && { href: '/reception', label: 'پذیرش‌های امروز', icon: 'calendar' },
          reception && { href: '/reception/open', label: 'پذیرش‌های باز', icon: 'folder', match: (p) => p === '/reception/open' || (/^\/reception\/[^/]+$/.test(p) && !['/reception/released', '/reception/stoppage', '/reception/night'].includes(p)) },
          reception && { href: '/reception/released', label: 'ترخیص‌شده‌ها', icon: 'check' },
          reception && { href: '/reception/night', label: 'لیست شب', icon: 'clock' },
          can('stoppage.read') && { href: '/reception/stoppage', label: 'خودروهای متوقف', icon: 'alert', match: (p) => p.startsWith('/reception/stoppage') },
        ],
        dispatch: [
          can('workshop.read') && { href: '/workshop', label: 'برنامه و تقسیم کار', icon: 'wrench' },
        ],
        // ۳ سالن: the shop-floor board is not built yet (slice S16) — hidden.
        floor: [],
        accident: [
          desk('expert') && home !== '/accidents/expert' && { href: '/accidents/expert', label: 'خودروهای تصادفی', icon: 'car' },
          can('case.read') && { href: '/cases', label: 'پرونده و کارشناسی', icon: 'folder', match: (p) => p.startsWith('/cases') && p !== '/cases/new' },
          can('case.create') && { href: '/cases/new', label: 'پذیرش خودروی تصادفی', icon: 'add' },
          reports && !manager && { href: '/reports', label: 'گزارش‌ها و فرم‌های تصادفات', icon: 'chart', match: (p) => p.startsWith('/reports') },
          // Case statistics: under «مدیر خدمات» for managers, otherwise with the accident cases.
          can('dashboard.read') && !manager && { href: '/', label: 'آمار پرونده‌ها', icon: 'chart' },
        ],
        special_aid: [
          can('special_aid.read') && home !== '/special-aid' && { href: '/special-aid', label: 'کارهای امروز امداد ویژه', icon: 'calendar' },
          can('special_aid.read') && { href: '/special-aid/vehicles', label: 'پرونده خودروها', icon: 'folder', match: (p) => p.startsWith('/special-aid/vehicles') },
          can('special_aid.supply') && { href: '/special-aid/supply', label: 'پیگیری تأمین قطعات', icon: 'truck' },
          can('special_aid.report') && { href: '/special-aid/reports', label: 'گزارش‌های امداد ویژه', icon: 'chart', match: (p) => p === '/special-aid/reports' || p === '/special-aid/feedback' },
          can('emdad.read') && { href: '/emdad', label: 'امداد ویژه تصادفات', icon: 'truck' },
          can('reference.appointments.read') && { href: '/reference-data?kind=appointments', label: 'نوبت‌های پذیرش', icon: 'calendar', match: () => false },
        ],
        parts: [
          can('case.read') && (can('part.manage') || can('part.request') || can('stock.read')) && home !== '/accidents/parts' && { href: '/parts', label: 'درخواست و تأمین قطعات', icon: 'box' },
          can('stock.read') && { href: '/stock', label: 'موجودی و رزرو', icon: 'layers' },
          (can('daily_reports.upload') || can('daily_reports.apply')) && { href: '/daily-reports', label: 'گزارش‌های روزانهٔ انبار', icon: 'upload' },
        ],
        // ۷ مشتری و پیامک: not built yet — hidden.
        customer: [],
        manager: [
          manager && home !== '/accidents/manager' && home !== '/accidents/owner' && { href: '/control-room', label: 'داشبورد مدیر خدمات', icon: 'gauge' },
          manager && can('stoppage.read') && { href: '/control-room/stoppages', label: 'گزارش خودروهای متوقف', icon: 'chart' },
          reports && manager && { href: '/reports', label: 'گزارش‌های مدیریتی', icon: 'chart', match: (p) => p.startsWith('/reports') },
          can('dashboard.read') && manager && { href: '/', label: 'آمار پرونده‌ها', icon: 'chart' },
        ],
        settings: [
          (ctx.isOwner || can('user.manage') || can('calendar.manage') || can('workshop.manage') || can('settings.manage') || can('reference.parts.read') || can('daily_reports.upload') || can('workshop.read') || can('integration.manage'))
            && { href: '/settings', label: 'تنظیمات سیستم', icon: 'gear', match: (p) => ['/settings', '/settings/reports', '/settings/pulse', '/settings/nexus', '/workshop/settings', '/reference-data'].includes(p) },
          (ctx.isOwner || can('user.manage')) && { href: '/users', label: 'کاربران و دسترسی‌ها', icon: 'team' },
        ],
      };
  const gate = (i: MenuItem): MenuItem | null => {
    const feature = featureOfPath(i.href);
    if (!feature) return i;
    if (!featureOpen(feature, ctx.isOwner, ctx.openFeatures)) return null;
    return featureTagged(feature, ctx.isOwner) ? { ...i, experimental: true } : i;
  };
  return MENU_SECTIONS.map((s) => ({ ...s, items: (items[s.key] ?? []).filter((i): i is MenuItem => !!i).map(gate).filter((i): i is MenuItem => !!i) })).filter((s) => s.items.length > 0);
}

/** The menu item a pathname belongs to (its own `match`, else the exact href). */
export function menuItemActive(item: MenuItem, pathname: string): boolean {
  return item.match ? item.match(pathname) : pathname === item.href;
}

/** Persian digit of a section number, for the menu. */
export const menuNumber = (n: number) => '۰۱۲۳۴۵۶۷۸۹'[n] ?? String(n);
