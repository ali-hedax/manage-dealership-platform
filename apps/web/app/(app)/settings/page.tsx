'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { InstallButton } from '@/components/InstallApp';

interface Item { href: string; title: string; detail: string; icon: IconName; show: boolean }

/** Settings hub: every settings area the account may open, in one place (no dead links). */
export default function SettingsPage() {
  const { me, can } = useAuth();
  // Owner, 2026-11-23: four clear areas instead of eight overlapping cards.
  const items: Item[] = [
    { href: '/users', title: 'کارکنان و دسترسی‌ها', detail: 'حساب‌ها و دعوت، پین، دسترسی هر نقش و استثنای هر نفر، اجازه‌های مدیر سیستم', icon: 'team', show: can('user.manage') || !!me.isOwner },
    { href: '/workshop/settings', title: 'کارگاه', detail: 'تقویم و ساعت کاری، کد جایگاه‌ها، سقف هزینه و هشدارها', icon: 'calendar', show: can('workshop.read') || can('calendar.manage') || can('settings.manage') },
    { href: '/settings/nexus', title: 'Manage Nexus', detail: 'مرکز دادهٔ کسب‌وکار: اتصال خودکار Manage Pulse، همهٔ گزارش‌ها، آخرین ورود و راهنمای گرفتن هر گزارش', icon: 'layers', show: can('integration.manage') || can('report_center.manage') || can('daily_reports.upload') || can('daily_reports.apply') || can('reference.customers.manage') },
    { href: '/reference-data', title: 'اطلاعات پایه', detail: 'کاتالوگ قطعات', icon: 'database', show: can('reference.parts.read') || can('reference.customers.read') },
  ];
  const visible = items.filter((i) => i.show);
  return (
    <section className="settings-hub" aria-labelledby="settings-title">
      <header className="page-title">
        <span className="page-title-ico" aria-hidden="true"><AppIcon name="gear" /></span>
        <div><h1 id="settings-title">تنظیمات</h1><p>{me.tenant.name}</p></div>
      </header>
      {!visible.length && <p className="m-empty">تنظیمی برای نقش شما نیست.</p>}
      <div className="settings-grid">
        {visible.map((i) => (
          <Link key={i.href} href={i.href} className="settings-card">
            <span className="settings-ico" aria-hidden="true"><AppIcon name={i.icon} /></span>
            <strong>{i.title}</strong>
            <span>{i.detail}</span>
          </Link>
        ))}
      </div>
      <div className="settings-install"><InstallButton /></div>
    </section>
  );
}
