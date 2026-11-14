'use client';

import { createContext, useContext, type ReactNode } from 'react';
import useSWR from 'swr';
import type { Me, Permission } from '@manage/shared';
import { ApiError, errorMessage, fetcher } from './api';

interface AuthState {
  me: Me;
  can: (p: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  // A 401 redirects to /login inside api().
  const { data, error, mutate } = useSWR<Me>('/auth/me', fetcher, { revalidateOnFocus: true, refreshInterval: 30_000, shouldRetryOnError: false });
  if (error && (!data || (error instanceof ApiError && error.status === 401))) return <div className="page" role="alert"><p>{error instanceof ApiError && error.status === 401 ? 'نشست ورود معتبر نیست؛ دوباره وارد شوید.' : errorMessage(error)}</p><button className="btn" onClick={() => void mutate()}>تلاش دوباره</button></div>;
  if (!data) return <>{fallback}</>;
  const perms = new Set(data.permissions);
  return <AuthContext.Provider value={{ me: data, can: (p) => perms.has(p) }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
