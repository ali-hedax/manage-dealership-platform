'use client';

import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { PageScrollShortcuts } from '@/components/PageScrollShortcuts';
import { AuthProvider } from '@/lib/auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider fallback={<div className="page muted">در حال بارگذاری…</div>}>
      <Shell>{children}<PageScrollShortcuts /></Shell>
    </AuthProvider>
  );
}
