'use client';

import { createContext, useContext, type ReactNode } from 'react';
import useSWR from 'swr';
import type { Me, Permission } from '@manage/shared';
import { fetcher } from './api';

interface AuthState {
  me: Me;
  can: (p: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  // A 401 redirects to /login inside api().
  const { data } = useSWR<Me>('/auth/me', fetcher, { revalidateOnFocus: false });
  if (!data) return <>{fallback}</>;
  const perms = new Set(data.permissions);
  return <AuthContext.Provider value={{ me: data, can: (p) => perms.has(p) }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
