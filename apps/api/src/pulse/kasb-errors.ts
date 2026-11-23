export type KasbErrorCode =
  | 'KASB_UNREACHABLE'
  | 'KASB_TIMEOUT'
  | 'KASB_KEYS'
  | 'KASB_DECRYPT'
  | 'KASB_PROTOCOL'
  | 'KASB_REJECTED'
  | 'KASB_AUTH'
  | 'KASB_NOT_ALLOWED';

/**
 * Failure of one exchange with کسب‌وکار. The message is only the stable code: no password,
 * token, passphrase, key or body ever reaches a log, an error, the audit trail or the API.
 */
export class KasbError extends Error {
  constructor(
    readonly code: KasbErrorCode,
    /** HTTP status when the server answered (no body is kept). */
    readonly status?: number,
    /** MessageCode of an unsuccessful answer (a short official code, not data). */
    readonly messageCode?: string,
  ) {
    super(code);
    this.name = 'KasbError';
  }
}

/** Short, secret-free form for logs. */
export function describeKasbError(e: unknown): string {
  if (e instanceof KasbError) return [e.code, e.status && `http ${e.status}`, e.messageCode && `message ${e.messageCode}`].filter(Boolean).join(' ');
  return e instanceof Error ? e.name : 'unknown';
}
