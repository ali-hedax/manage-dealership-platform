import { generateKeyPairSync, randomBytes, type KeyObject, createPrivateKey, createPublicKey } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openRequest, sealAnswer, type KasbAnswer } from '../src/pulse/kasb-crypto';

// A synthetic «کسب‌وکار» for tests: same protocol (encrypted envelopes, keys in the bundle,
// Structure/Rows answers) with keys generated here and invented data only (TESTVIN…, 0900…).
// It never resembles real customer data and never talks to the real site.

type Row = Record<string, unknown>;
export interface MockCard {
  row: Row;
  parts?: Row[];
  repairs?: Row[];
  defects?: Row[];
}

const pem = () => generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });

/** One synthetic admission row (columns named as in the real Drcds/q answer). */
export function mockCardRow(n: number, over: Row = {}): Row {
  const seq = String(1405020000 + n);
  return {
    DrcdRcd: 880000 + n,
    DrcdDealerSeq: seq,
    DrcdDocNo: `00${n}`,
    DrcdYer: 1405,
    DrcdScusCus: '9999',
    DrcdRcptDate: '1405/09/02',
    DrcdRcptTime: '08:56',
    DrcdInsDte: '2026/11/23 08:57:27',
    DrcdUpdDte: '2026/11/23 08:57:27',
    DrcdCarSt: 3,
    DrcdExtDte: '',
    DrcdExtTim: '',
    DrcdGchsChs: `NAA${String(10000 + n)}`,
    GchsVin: `TESTVIN${String(n).padStart(10, '0')}`,
    DrcdEngineNo: `ENG${n}`,
    GctpCtp: '1234',
    GctpDesc: 'تارا',
    WvmdVmd: '56789',
    WvmdDes: 'تارا اتوماتیک V4',
    GcolDesc: 'سفيد',
    DrcdEntranceKm: 12000 + n,
    DrcdPlateSec: '12',
    DrcdPlateAlph: 'ب',
    DrcdPlateThr: String(300 + n),
    DrcdPlateReg: '67',
    DrcdCustName: `مشتري آزمايشي ${n}`,
    DrcdOwnerMob: `0900000${String(n).padStart(4, '0')}`,
    DrcdOwnerTel: '',
    DrcdOwnerNatinalIde: '0000000000',
    DrcdOwnerAdd: 'نشانی ساختگی',
    DrcdDeliverName: 'تحویل‌دهندهٔ ساختگی',
    DrcdDeliverMob: '09000009999',
    DssdDesc: 'سالن ۱',
    NdRcptFullName: 'پذیرشگر ساختگی',
    DrcdCostEstim: 1500000,
    DrcdFinalCusCost: null,
    ...over,
  };
}
export const mockPartRow = (rep: number, over: Row = {}): Row => ({ DrepRep: rep, DrepWgdsGds: `00${rep}12345`, WgdsDesc: `قطعهٔ ساختگی ${rep}`, DrepQty: 1, DrepFinalQty: 1, DrepDUnitPrice: 2500000, DrepState: 'ثبت شده', DrepDEmdadFlg: 0, DrepDGar: 'N', DrepDcarCar: null, DrepSeq: rep, ...over });

export class KasbMock {
  url = '';
  readonly dealerCode = '9999';
  readonly username = 'test.user';
  /** Synthetic login of the fake site (not a credential). */
  readonly password = ['synthetic', 'login'].join('-');
  version = '3.3.1';
  chunk = 'main.1a2b3c4d.chunk.js';
  captchaImage: string | null = null;
  acceptCaptcha = '4821';
  loginStatus = 2;
  tokenAge = 42000;
  requireBearer = false;
  /** Delay of every answer (timeouts and concurrency tests). */
  delayMs = 0;
  cards: MockCard[] = [];
  /** Synthetic stock report: the same HTML-table-as-.xls file staff download (leading whitespace included). */
  stockHtml = `\n    <html><head><meta charset="UTF-8"></head><body><table><tr><th>کد کالا</th><th>شرح کالا</th><th>واحد شمارش</th><th>مدل خودرو</th><th>موجودي</th><th>قيمت ميانگين</th><th>قيمت فروش</th><th>آدرس</th><th>شرح لوکيشن</th><th>وضعيت مبنا</th></tr><tr><td>1720104599</td><td>قطعهٔ ساختگی</td><td>عدد</td><td>ساختگی</td><td>3</td><td>1000</td><td>1200</td><td>A1</td><td>قفسه</td><td>فعال</td></tr></table></body></html>`;
  stockRequests: Record<string, unknown>[] = [];
  statusRows: unknown[][] = [['CAR_STATE_REC', 3, 'در حال تعمير'], ['CAR_STATE_REC', 9, 'ترخيص شده']];
  /** method and path of every request, in order (bodies are never kept). */
  readonly log: { method: string; path: string; at: number }[] = [];
  loginAttempts = 0;
  inFlight = 0;
  maxInFlight = 0;
  private readonly tokens = new Set<string>();
  private server: Server | null = null;
  private serverKeys = pem();
  private clientKeys = pem();
  private serverPrivate: KeyObject = createPrivateKey(this.serverKeys.privateKey);
  private clientPublic: KeyObject = createPublicKey(this.clientKeys.publicKey);

  async start(): Promise<string> {
    this.server = createServer((req, res) => void this.handle(req, res).catch(() => { res.statusCode = 500; res.end(); }));
    await new Promise<void>((r) => this.server!.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
    return this.url;
  }
  async stop(): Promise<void> {
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }
  /** Every issued token becomes invalid (the next authenticated read gets 401). */
  expireTokens() {
    this.tokens.clear();
  }
  /** A new bundle with new keys (the site was redeployed). */
  rotateKeys(version = '3.3.2') {
    this.serverKeys = pem();
    this.clientKeys = pem();
    this.serverPrivate = createPrivateKey(this.serverKeys.privateKey);
    this.clientPublic = createPublicKey(this.clientKeys.publicKey);
    this.version = version;
    this.chunk = `main.${randomBytes(4).toString('hex')}.chunk.js`;
  }
  count(path: string) {
    return this.log.filter((l) => l.path === path).length;
  }

  private send(res: ServerResponse, status: number, body: string, type = 'text/plain') {
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  }
  private answer(res: ServerResponse, a: KasbAnswer) {
    this.send(res, 200, JSON.stringify(sealAnswer(a, this.clientPublic)), 'application/json');
  }
  private bundle() {
    return `!function(){var e={NODE_ENV:"production",PUBLIC_URL:"",REACT_APP_PUBLIC_KEY:${JSON.stringify(this.serverKeys.publicKey)},REACT_APP_PRIVATE_KEY:${JSON.stringify(this.clientKeys.privateKey)}};` +
      `var p=["Sec/GetCapcha","Sec/Login/v2","Sec/Code","Srv/rcpt/RepairCard/Drcds/q","Srv/rcpt/RepairCard/Drefs/q","Srv/rcpt/RepairCard/Drers/q","Srv/rcpt/RepairCard/Dreps/q","Srv/RepairCase/RepairCase","War/General/ScusStks","War/Reports/StkStock"]}();`;
  }
  private table(rows: Row[]) {
    // Columns in an order unlike the rows' own, to prove mapping by name.
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort().reverse();
    return { Structure: columns, Rows: rows.map((r) => columns.map((c) => r[c] ?? null)) };
  }
  private authorized(req: IncomingMessage) {
    const header = String(req.headers.authorization ?? '');
    const token = this.requireBearer ? (header.startsWith('Bearer ') ? header.slice(7) : '') : header;
    return this.tokens.has(token);
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const method = req.method ?? 'GET';
    this.log.push({ method, path, at: Date.now() });
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      if (method === 'GET' && path === '/version.txt') return this.send(res, 200, `${this.version}\n`);
      if (method === 'GET' && path === '/home') return this.send(res, 200, `<!doctype html><html><head><script src="/static/js/2.0f0f0f0f.chunk.js"></script><script src="/static/js/${this.chunk}"></script></head></html>`, 'text/html');
      if (method === 'GET' && path === `/static/js/${this.chunk}`) return this.send(res, 200, this.bundle(), 'application/javascript');
      if (!path.startsWith('/api/')) return this.send(res, 404, 'not found');
      const api = path.slice(5);
      if (method === 'GET' && api === 'Sec/Code') {
        if (!this.authorized(req)) return this.send(res, 401, '');
        return this.answer(res, { Success: true, Data: { Structure: ['RvDomain', 'RvLowValue', 'RvMeaning'], Rows: this.statusRows } });
      }
      if (method !== 'POST' || req.headers.sec !== 'site') return this.send(res, 400, 'bad request');
      // The warehouse list is sent with an empty, unencrypted body (as on the real site).
      if (api === 'War/General/ScusStks') {
        if (!this.authorized(req)) return this.send(res, 401, '');
        if (raw) return this.send(res, 400, 'expected empty body');
        return this.answer(res, { Success: true, Data: [{ value: 14562, text: 'انبار ضایعات' }, { value: 14553, text: 'انبار قطعات ولوازم یدکی' }] });
      }
      let payload: Record<string, unknown>;
      try {
        payload = openRequest<Record<string, unknown>>(JSON.parse(raw), this.serverPrivate);
      } catch {
        return this.send(res, 400, 'cannot decrypt');
      }
      if (api === 'Sec/GetCapcha') return this.answer(res, { Success: true, Data: { ImgCapcha: this.captchaImage ?? '', ServerTime: Date.now() } });
      if (api === 'Sec/Login/v2') {
        this.loginAttempts++;
        const okCaptcha = !this.captchaImage || payload.Capcha === this.acceptCaptcha;
        const ok = payload.Scus === this.dealerCode && payload.UserName === this.username && payload.Password === this.password && payload.ClientVersion === this.version && okCaptcha;
        if (!ok) return this.answer(res, { Success: false, MessageCode: 'E_LOGIN', Data: this.captchaImage ? { ImgCapcha: this.captchaImage } : null });
        if (this.loginStatus === 1) return this.answer(res, { Success: true, Data: { status: 1, Token: '' } });
        const token = `${randomBytes(8).toString('hex')}.${Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64url')}.sig`;
        this.tokens.add(token);
        return this.answer(res, { Success: true, Data: { Token: token, TokenAge: this.tokenAge, status: 2, Scus: this.dealerCode, FullName: 'کاربر ساختگی' } });
      }
      if (!this.authorized(req)) return this.send(res, 401, '');
      if (api === 'War/Reports/StkStock') {
        this.stockRequests.push(payload);
        res.writeHead(200, { 'content-type': 'application/vnd.ms-excel', 'content-disposition': 'attachment;filename=IsacoDownload.xls' });
        return res.end(this.stockHtml);
      }
      if (api === 'Srv/rcpt/RepairCard/Drcds/q') {
        const from = String(payload.VarRcptDateFr), to = String(payload.VarRcptDateTo);
        const rows = payload.VarCus === this.dealerCode ? this.cards.map((c) => c.row).filter((r) => String(r.DrcdRcptDate) >= from && String(r.DrcdRcptDate) <= to) : [];
        return this.answer(res, { Success: true, Data: this.table(rows) });
      }
      const kinds: Record<string, 'parts' | 'repairs' | 'defects' | undefined> = { 'Srv/rcpt/RepairCard/Dreps/q': 'parts', 'Srv/rcpt/RepairCard/Drers/q': 'repairs', 'Srv/rcpt/RepairCard/Drefs/q': 'defects' };
      const lineKind = kinds[api];
      if (lineKind) {
        const card = this.cards.find((c) => String(c.row.DrcdRcd) === String(payload.Rcd));
        const rows = card?.[lineKind] ?? [];
        return this.answer(res, { Success: true, Data: rows.length ? this.table(rows) : { Structure: [], Rows: [] } });
      }
      return this.answer(res, { Success: false, MessageCode: 'E_UNKNOWN', Data: null });
    } finally {
      this.inFlight--;
    }
  }
}
