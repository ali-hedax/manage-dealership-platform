import { KasbClient, assertAllowed, jwtExpiry } from '../src/pulse/kasb-client';
import { KASB_PATHS } from '../src/pulse/kasb-protocol';
import { KasbMock, mockCardRow, mockPartRow } from './kasb-mock';

// The client against a synthetic کسب‌وکار speaking the same encrypted protocol.
describe('KasbClient against the synthetic کسب‌وکار', () => {
  let mock: KasbMock;
  const creds = () => ({ dealerCode: mock.dealerCode, username: 'Test.User', password: mock.password });
  const client = (extra: ConstructorParameters<typeof KasbClient>[0] = {}) => new KasbClient({ origin: mock.url, minGapMs: 5, ...extra });

  beforeEach(async () => {
    mock = new KasbMock();
    await mock.start();
    mock.cards = [{ row: mockCardRow(1), parts: [mockPartRow(11)] }, { row: mockCardRow(2, { DrcdRcptDate: '1405/09/01' }) }];
  });
  afterEach(async () => {
    await mock.stop();
  });

  it('reads the keys from the bundle, logs in (lower-case user name) and reads lists by column name', async () => {
    const c = client();
    expect(await c.login(creds())).toMatchObject({ kind: 'ok' });
    expect(c.hasSession()).toBe(true);
    expect(c.clientVersion).toBe('3.3.1');
    const today = await c.cards(mock.dealerCode, '1405/09/02', '1405/09/02');
    expect(today.rows).toHaveLength(1);
    expect(today.rows[0]!.DrcdDealerSeq).toBe('1405020001');
    expect((await c.cards(mock.dealerCode, '1405/09/01', '1405/09/02')).rows).toHaveLength(2);
    const parts = await c.lines('parts', today.rows[0]!.DrcdRcd);
    expect(parts.rows[0]!.WgdsDesc).toBe('قطعهٔ ساختگی 11');
    // An empty card answers with an empty Structure.
    expect(await c.lines('repairs', today.rows[0]!.DrcdRcd)).toEqual({ columns: [], rows: [] });
    expect((await c.codes()).rows).toHaveLength(2);
    expect(c.bundleWarnings).toEqual([]);
  });

  it('lists warehouses and downloads the stock report file unchanged (owner, 2026-11-23)', async () => {
    const c = client();
    await expect(c.warehouses()).rejects.toMatchObject({ code: 'KASB_AUTH' });
    await c.login(creds());
    const list = await c.warehouses();
    expect(list.map((w) => w.text)).toContain('انبار قطعات ولوازم یدکی');
    const file = await c.stockFile('14553', 1405);
    expect(file.toString('utf8')).toBe(mock.stockHtml);
    expect(mock.stockRequests[0]).toEqual({ CurYear: '1405', DssdSsd: '14553', WgdmGdm: '', TypeGhete: '' });
  });

  it('sends only allowlisted, read-only requests', async () => {
    const seen: string[] = [];
    const c = client({ onRequest: (m, p) => seen.push(`${m} ${p}`) });
    await c.login(creds());
    await expect(c.read('Srv/rcpt/RepairCard/Save', {})).rejects.toThrow('KASB_NOT_ALLOWED');
    await expect(c.read(KASB_PATHS.cards, {}, 'GET')).rejects.toThrow('KASB_NOT_ALLOWED');
    expect(mock.log.some((l) => l.path.includes('Save'))).toBe(false);
    expect(seen.every((s) => /^(GET \/(home|version\.txt|static\/js\/main\.[^/]+\.chunk\.js|api\/Sec\/Code)|POST \/api\/(Sec\/(GetCapcha|Login\/v2)|Srv\/rcpt\/RepairCard\/(Drcds|Drefs|Drers|Dreps)\/q))$/.test(s))).toBe(true);
    const origin = 'https://b2b.isaco.ir';
    expect(() => assertAllowed(origin, 'POST', new URL('https://b2b.isaco.ir/api/Srv/rcpt/RepairCard/Drcds/q'))).not.toThrow();
    expect(() => assertAllowed(origin, 'GET', new URL('https://b2b.isaco.ir/static/js/main.abc123.chunk.js'))).not.toThrow();
    for (const [m, u] of [
      ['POST', 'https://b2b.isaco.ir/api/Srv/rcpt/RepairCard/Drcd/save'],
      ['DELETE', 'https://b2b.isaco.ir/api/Srv/rcpt/RepairCard/Drcds/q'],
      ['POST', 'https://evil.example/api/Sec/Login/v2'],
      ['GET', 'https://b2b.isaco.ir/api/Srv/rcpt/RepairCard/Drcds/q'],
      ['POST', 'https://b2b.isaco.ir/home'],
      ['GET', 'https://b2b.isaco.ir/static/js/2.abc.chunk.js'],
      ['GET', 'https://b2b.isaco.ir/home?x=1'],
    ] as const) expect(() => assertAllowed(origin, m, new URL(u))).toThrow('KASB_NOT_ALLOWED');
  });

  it('reports a captcha instead of logging in, then logs in once with the answer', async () => {
    mock.captchaImage = 'data:image/png;base64,iVBORw0KGgo=';
    const c = client();
    expect(await c.login(creds())).toEqual({ kind: 'captcha', image: mock.captchaImage });
    expect(mock.loginAttempts).toBe(0);
    expect(await c.login(creds(), '4821')).toMatchObject({ kind: 'ok' });
    expect(mock.loginAttempts).toBe(1);
  });

  it('distinguishes a refused login and a required password change; never retries by itself', async () => {
    const c = client();
    expect(await c.login({ ...creds(), password: 'wrong' })).toEqual({ kind: 'failed', messageCode: 'E_LOGIN' });
    expect(mock.loginAttempts).toBe(1);
    mock.loginStatus = 1;
    expect(await c.login(creds())).toEqual({ kind: 'password_change' });
    expect(c.hasSession()).toBe(false);
  });

  it('refuses reads without a session and after the token expired (the caller logs in again)', async () => {
    const c = client();
    await expect(c.cards(mock.dealerCode, '1405/09/02', '1405/09/02')).rejects.toThrow('KASB_AUTH');
    await c.login(creds());
    mock.expireTokens();
    await expect(c.cards(mock.dealerCode, '1405/09/02', '1405/09/02')).rejects.toThrow('KASB_AUTH');
  });

  it('falls back to «Bearer <token>» once when the raw token is refused', async () => {
    mock.requireBearer = true;
    const c = client();
    await c.login(creds());
    expect((await c.cards(mock.dealerCode, '1405/09/02', '1405/09/02')).rows).toHaveLength(1);
    expect(c.authScheme).toBe('bearer');
  });

  it('reads the keys again after the site changed its bundle', async () => {
    const c = client();
    await c.login(creds());
    mock.rotateKeys('3.3.2');
    // The old session is gone with the old server; a new login uses the new version and keys.
    expect(await c.login(creds())).toMatchObject({ kind: 'ok' });
    expect(c.clientVersion).toBe('3.3.2');
  });

  it('keeps at most two requests in flight and spaces their starts', async () => {
    mock.delayMs = 40;
    const c = client({ minGapMs: 60 });
    await c.login(creds());
    const before = mock.log.length;
    await Promise.all([1, 2, 3, 4, 5].map(() => c.lines('parts', 880001)));
    const starts = mock.log.slice(before).map((l) => l.at);
    expect(mock.maxInFlight).toBeLessThanOrEqual(2);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(50);
  });

  it('maps network failures and timeouts to stable codes', async () => {
    mock.delayMs = 300;
    await expect(client({ timeoutMs: 50 }).loadKeys()).rejects.toThrow('KASB_TIMEOUT');
    await mock.stop();
    await expect(client().loadKeys()).rejects.toThrow('KASB_UNREACHABLE');
    await mock.start();
  });

  it('reads the JWT expiry claim when present', () => {
    const token = `x.${Buffer.from(JSON.stringify({ exp: 2_000_000_000 })).toString('base64url')}.y`;
    expect(jwtExpiry(token)).toBe(2_000_000_000_000);
    expect(jwtExpiry('not-a-jwt')).toBeNull();
  });
});
