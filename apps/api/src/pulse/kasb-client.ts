import type { KeyObject } from 'node:crypto';
import { importPrivateKey, importPublicKey, openAnswer, sealRequest, type KasbAnswer } from './kasb-crypto';
import { KasbError } from './kasb-errors';
import { extractKeys, findMainChunk, missingServicePaths } from './kasb-keys';
import { captchaFields, KASB_ALLOWED_API, KASB_ALLOWED_STATIC, KASB_ORIGIN, KASB_PATHS, KASB_USER_AGENT, LOGIN_STATUS_CHANGE_PASSWORD, LOGIN_STATUS_OK } from './kasb-protocol';
import { parseTable, type KasbTable } from './kasb-table';

// HTTP client of کسب‌وکار: the same JSON API the browser calls, over plain HTTPS (no browser
// automation). Read-only by construction: every request is checked against the allowlist in
// kasb-protocol.ts before it is sent. At most two requests run at once and request starts are
// at least 300 ms apart; each request times out after 30 seconds. The session token lives only
// in this object (worker memory), never in the database.

export interface KasbCredentials {
  dealerCode: string;
  username: string;
  password: string;
}
export type LoginResult =
  | { kind: 'ok'; expiresAt: Date }
  | { kind: 'captcha'; image: string }
  | { kind: 'password_change' }
  | { kind: 'failed'; messageCode: string | null };
export type LineKind = 'parts' | 'repairs' | 'defects';

export interface KasbClientOptions {
  origin?: string;
  fetch?: typeof fetch;
  now?: () => number;
  minGapMs?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Observes every request that passed the allowlist (tests). Never receives a body. */
  onRequest?: (method: string, path: string) => void;
}

const FALLBACK_CLIENT_VERSION = '3.3.1';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Throws KASB_NOT_ALLOWED unless the request is on the read-only allowlist of the origin. */
export function assertAllowed(origin: string, method: string, url: URL): void {
  const base = new URL(origin);
  if (url.origin !== base.origin || url.search || url.hash) throw new KasbError('KASB_NOT_ALLOWED');
  if (url.pathname.startsWith('/api/')) {
    if (KASB_ALLOWED_API.get(url.pathname.slice(5)) !== method) throw new KasbError('KASB_NOT_ALLOWED');
    return;
  }
  if (method !== 'GET' || !KASB_ALLOWED_STATIC.some((re) => re.test(url.pathname))) throw new KasbError('KASB_NOT_ALLOWED');
}

/** Expiry of a JWT from its own `exp` claim (not verified: only used to refresh in time). */
export function jwtExpiry(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const exp = (JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export class KasbClient {
  readonly origin: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly minGapMs: number;
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly onRequest?: (method: string, path: string) => void;
  private keys: { serverPublic: KeyObject; clientPrivate: KeyObject; version: string } | null = null;
  private token: { value: string; expiresAt: number } | null = null;
  private scheme: 'raw' | 'bearer' = 'raw';
  private active = 0;
  private nextStart = 0;
  private readonly waiters: (() => void)[] = [];
  /** Allowlisted service paths not found in the current bundle (the site may have changed). */
  bundleWarnings: string[] = [];

  constructor(opts: KasbClientOptions = {}) {
    this.origin = (opts.origin ?? KASB_ORIGIN).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.minGapMs = opts.minGapMs ?? 300;
    this.concurrency = Math.max(1, opts.concurrency ?? 2);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.onRequest = opts.onRequest;
  }

  get clientVersion(): string {
    return this.keys?.version || FALLBACK_CLIENT_VERSION;
  }
  /** «Authorization: <token>» or, if the site answers 401 to that, «Bearer <token>». */
  get authScheme(): 'raw' | 'bearer' {
    return this.scheme;
  }
  hasSession(): boolean {
    return !!this.token && this.token.expiresAt > this.now() + 60_000;
  }
  clearSession(): void {
    this.token = null;
  }

  // ------------------------------------------------------------ transport

  private async acquire(): Promise<void> {
    if (this.active >= this.concurrency) await new Promise<void>((r) => this.waiters.push(r));
    else this.active++;
    const start = Math.max(this.now(), this.nextStart);
    this.nextStart = start + this.minGapMs;
    const wait = start - this.now();
    if (wait > 0) await sleep(wait);
  }
  private release(): void {
    const next = this.waiters.shift();
    if (next) next(); // the slot passes directly to the next request
    else this.active--;
  }

  private async request(method: 'GET' | 'POST', path: string, init: { body?: string; headers?: Record<string, string> } = {}): Promise<Response> {
    const url = new URL(path, `${this.origin}/`);
    assertAllowed(this.origin, method, url);
    await this.acquire();
    try {
      this.onRequest?.(method, url.pathname);
      const res = await this.fetchImpl(url, {
        method,
        body: init.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'User-Agent': KASB_USER_AGENT, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8', Referer: `${this.origin}/home`, ...init.headers },
      });
      if (res.status >= 300 && res.status < 400) throw new KasbError('KASB_PROTOCOL', res.status);
      return res;
    } catch (e) {
      if (e instanceof KasbError) throw e;
      const name = (e as { name?: string })?.name;
      throw new KasbError(name === 'TimeoutError' || name === 'AbortError' ? 'KASB_TIMEOUT' : 'KASB_UNREACHABLE');
    } finally {
      this.release();
    }
  }

  private async text(path: string): Promise<string> {
    const res = await this.request('GET', path);
    if (res.status >= 500) throw new KasbError('KASB_UNREACHABLE', res.status);
    if (!res.ok) throw new KasbError('KASB_PROTOCOL', res.status);
    return res.text();
  }

  // ------------------------------------------------------------ keys

  /** Reads the two RSA keys from the public bundle; cached until /version.txt changes or `force`. */
  async loadKeys(force = false): Promise<void> {
    const version = (await this.text('/version.txt')).trim().slice(0, 32);
    if (!force && this.keys && this.keys.version === version) return;
    const chunk = findMainChunk(await this.text('/home'));
    if (!chunk) throw new KasbError('KASB_KEYS');
    const bundle = await this.text(chunk);
    const { publicKey, privateKey } = extractKeys(bundle);
    this.keys = { serverPublic: importPublicKey(publicKey), clientPrivate: importPrivateKey(privateKey), version: version || FALLBACK_CLIENT_VERSION };
    this.bundleWarnings = missingServicePaths(bundle, KASB_ALLOWED_API.keys());
  }

  private async exchange<T>(path: string, payload: unknown, method: 'GET' | 'POST', auth: boolean, retried = false): Promise<KasbAnswer<T>> {
    if (!this.keys) await this.loadKeys();
    const keys = this.keys!;
    const headers: Record<string, string> = { sec: 'site', Origin: this.origin };
    if (method === 'POST') headers['Content-Type'] = 'application/json;charset=UTF-8';
    if (auth && this.token) headers.Authorization = this.scheme === 'bearer' ? `Bearer ${this.token.value}` : this.token.value;
    const res = await this.request(method, `/api/${path}`, { headers, body: method === 'POST' ? JSON.stringify(sealRequest(payload ?? {}, keys.serverPublic)) : undefined });
    if (res.status === 401 || res.status === 403) throw new KasbError('KASB_AUTH', res.status);
    if (res.status >= 500) throw new KasbError('KASB_UNREACHABLE', res.status);
    if (!res.ok) throw new KasbError('KASB_PROTOCOL', res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new KasbError('KASB_PROTOCOL', res.status);
    }
    try {
      return openAnswer<T>(body, keys.clientPrivate);
    } catch (e) {
      // A new client key in a new bundle: read the keys again and repeat this read once.
      if (!retried && e instanceof KasbError && e.code === 'KASB_DECRYPT') {
        await this.loadKeys(true);
        return this.exchange<T>(path, payload, method, auth, true);
      }
      throw e;
    }
  }

  // ------------------------------------------------------------ session

  /** Sec/GetCapcha: a non-empty ImgCapcha (data URL) means the site wants a captcha. */
  async checkCaptcha(): Promise<string | null> {
    const answer = await this.exchange<{ ImgCapcha?: unknown }>(KASB_PATHS.captcha, { Lng: 'fa' }, 'POST', false);
    if (!answer.Success) throw new KasbError('KASB_REJECTED', undefined, answer.MessageCode != null ? String(answer.MessageCode) : undefined);
    const image = answer.Data?.ImgCapcha;
    return typeof image === 'string' && image.length > 0 ? image : null;
  }

  /** One login attempt (never a retry loop: the caller counts failures). */
  async login(creds: KasbCredentials, captchaAnswer: string | null = null): Promise<LoginResult> {
    this.clearSession();
    // Every login checks /version.txt; a new version means a new bundle and possibly new keys.
    await this.loadKeys();
    if (!captchaAnswer) {
      const image = await this.checkCaptcha();
      if (image) return { kind: 'captcha', image };
    }
    const payload = { Scus: creds.dealerCode, UserName: creds.username.toLowerCase(), Password: creds.password, ClientVersion: this.clientVersion, Lng: 'fa', ...captchaFields(captchaAnswer) };
    const answer = await this.exchange<Record<string, unknown> | null>(KASB_PATHS.login, payload, 'POST', false);
    const data = answer.Data ?? {};
    const status = data.status == null ? null : Number(data.status);
    if (answer.Success && status === LOGIN_STATUS_CHANGE_PASSWORD) return { kind: 'password_change' };
    if (answer.Success && typeof data.Token === 'string' && data.Token && (status === LOGIN_STATUS_OK || status == null)) {
      const age = Number(data.TokenAge);
      const byAge = this.now() + (Number.isFinite(age) && age > 0 ? age * 1000 : 3_600_000);
      const byClaim = jwtExpiry(data.Token) ?? Infinity;
      const expiresAt = Math.min(byAge, byClaim) - 5 * 60_000;
      this.token = { value: data.Token, expiresAt };
      return { kind: 'ok', expiresAt: new Date(expiresAt) };
    }
    if (typeof data.ImgCapcha === 'string' && data.ImgCapcha) return { kind: 'captcha', image: data.ImgCapcha };
    return { kind: 'failed', messageCode: answer.MessageCode != null ? String(answer.MessageCode) : status != null ? `status:${status}` : null };
  }

  // ------------------------------------------------------------ reads

  /** Data of an authenticated read. KASB_AUTH without a session; KASB_REJECTED when Success is false. */
  async read<T = unknown>(path: string, payload?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<T> {
    if (!this.hasSession()) throw new KasbError('KASB_AUTH');
    let answer: KasbAnswer<T>;
    try {
      answer = await this.exchange<T>(path, payload, method, true);
    } catch (e) {
      // The site's own code sends the raw token; if it is refused, try the Bearer form once.
      if (!(e instanceof KasbError) || e.code !== 'KASB_AUTH' || this.scheme === 'bearer') throw e;
      this.scheme = 'bearer';
      try {
        answer = await this.exchange<T>(path, payload, method, true);
      } catch (again) {
        this.scheme = 'raw';
        throw again;
      }
    }
    if (!answer.Success) throw new KasbError('KASB_REJECTED', undefined, answer.MessageCode != null ? String(answer.MessageCode) : undefined);
    return answer.Data;
  }

  /** Admission list (repair cards) of the dealership between two Jalali dates (inclusive). */
  async cards(dealerCode: string, fromJalali: string, toJalali: string): Promise<KasbTable> {
    return parseTable(await this.read(KASB_PATHS.cards, { VarCus: dealerCode, VarRcptDateFr: fromJalali, VarRcptDateTo: toJalali, VarDealerSeq: '', VarChs: '' }));
  }

  /** Parts, repairs (labour) or defects of one card; `rcd` is DrcdRcd exactly as listed. */
  async lines(kind: LineKind, rcd: unknown): Promise<KasbTable> {
    const path = kind === 'parts' ? KASB_PATHS.parts : kind === 'repairs' ? KASB_PATHS.repairs : KASB_PATHS.defects;
    return parseTable(await this.read(path, { Rcd: rcd }));
  }

  /** Reference codes (status texts). */
  async codes(): Promise<KasbTable> {
    return parseTable(await this.read(KASB_PATHS.codes, undefined, 'GET'));
  }
}
