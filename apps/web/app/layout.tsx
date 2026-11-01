import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
// Self-hosted Vazirmatn: no request to Google Fonts (unreliable from Iran, and
// the app must work on the dealership LAN without internet).
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/vazirmatn/800.css';
import './globals.css';
import { ToastProvider } from '@/lib/toast';

export const metadata: Metadata = {
  title: 'Manage by HEDAX',
  description: 'سامانه مدیریت عملیات نمایندگی خودرو',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a202c',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
