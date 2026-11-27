import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/vazirmatn/300.css';
import '../ds-tokens.css';
import '../ds-components.css';
import './screens.css';

// Design preview (slices S03/S04): the locked design system and the seven key screens with
// synthetic data only. No API calls, no real customer data; staging sits behind its own password.
export const metadata: Metadata = { title: 'Manage · پیش‌نمایش طراحی', robots: { index: false, follow: false } };

export default function DesignPreviewLayout({ children }: { children: ReactNode }) {
  return <div className="ds-root">{children}</div>;
}
