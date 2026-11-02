'use client';

import type { ApiError as ApiErrorBody } from '@manage/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** UUID v4; crypto.randomUUID is unavailable on plain-HTTP LAN addresses. */
export function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  /** Reuse the same key when retrying the same user action. */
  idempotencyKey?: string;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const headers: Record<string, string> = { 'x-manage-client': 'web' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['idempotency-key'] = opts.idempotencyKey ?? newKey();

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (ApiErrorBody & T) | null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(
      res.status,
      data?.code ?? 'HTTP_ERROR',
      data?.message ?? 'خطای ناشناخته در سرور',
      data?.details,
    );
  }
  return data as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details.length) {
      const first = err.details[0] as { path: string; message: string };
      return `${err.message}: ${first.message}`;
    }
    return err.message;
  }
  return 'خطای غیرمنتظره رخ داد';
}
