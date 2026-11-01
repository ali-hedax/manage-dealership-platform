// Preview-only form gate: no browser HTTP authentication dialog is required.
import http from 'node:http';
import { randomBytes, createHmac, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const scrypt = promisify(scryptCallback);
const COOKIE = '__Host-manage_preview';
const TTL = 12 * 60 * 60;
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
export function createGate(config) {
  const [salt, digest] = config.passwordHash.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(digest ?? '') || config.sessionKey.length < 48)
    throw new Error('Preview gate secrets are missing or invalid');
  const origin = `https://${config.host}`;
  const sign = value => createHmac('sha256', config.sessionKey).update(value).digest('base64url');
  const token = () => { const value = `${Math.floor(Date.now()/1000)+TTL}.${randomBytes(16).toString('hex')}`; return `${value}.${sign(value)}`; };
  function validToken(value) {
    if (!/^\d{10}\.[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
    const [expires, nonce, signature] = value.split('.');
    const remaining = Number(expires) - Math.floor(Date.now()/1000);
    return remaining > 0 && remaining <= TTL && equal(Buffer.from(signature), Buffer.from(sign(`${expires}.${nonce}`)));
  }
  const attempts = new Map();
  const cleanup = setInterval(() => { for (const [key, item] of attempts) if (item.until < Date.now()) attempts.delete(key); }, 60000);
  cleanup.unref();
  function allowed(ip) {
    const old = attempts.get(ip);
    if (old && old.until > Date.now()) { old.count++; return old.count <= 8; }
    if (attempts.size >= 10000) return false;
    attempts.set(ip, {count: 1, until: Date.now()+15*60000}); return true;
  }
  async function credentials(username, password) {
    if (password.length > 512) return false;
    const actual = await scrypt(password, salt, 64);
    return equal(actual, Buffer.from(digest, 'hex')) && username === 'preview';
  }
  const html = readFileSync(new URL('./gate.html', import.meta.url));
  const css = readFileSync(new URL('./gate.css', import.meta.url));
  const server = http.createServer(async (req, res) => {
    const send = (status, body, headers={}) => { res.writeHead(status, {'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow',...headers}); res.end(body); };
    try {
      const url = new URL(req.url, origin);
      if (url.pathname === '/__preview/health') return send(200, 'ok');
      if (url.pathname === '/__preview/gate.css' && req.method === 'GET') return send(200, css, {'Content-Type':'text/css; charset=utf-8'});
      if (url.pathname === '/__preview/login' && req.method === 'GET') return send(200, html.toString().replace('<!-- error -->', url.searchParams.has('error') ? '<p role="alert">نام کاربری یا رمز درست نیست. دوباره بررسی کنید.</p>' : ''), {
        'Content-Type':'text/html; charset=utf-8',
        'Content-Security-Policy':"default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        'X-Content-Type-Options':'nosniff'
      });
      // Caddy overwrites this header; the gate has no host-published port.
      const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
      if (url.pathname === '/__preview/login' && req.method === 'POST') {
        if (req.headers.origin !== origin) return send(403, 'درخواست ورود معتبر نیست.');
        if (!allowed(ip)) return send(429, 'تعداد تلاش‌ها زیاد است. ۱۵ دقیقه دیگر دوباره امتحان کنید.', {'Retry-After':'900'});
        if (!String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')) return send(415, 'Unsupported content type');
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>4096) return send(413, 'Request too large'); }
        const form = new URLSearchParams(body);
        if (!await credentials(form.get('username') ?? '', form.get('password') ?? ''))
          return send(303, '', {Location:'/__preview/login?error=1'});
        attempts.delete(ip);
        return send(303, '', {Location:'/login', 'Set-Cookie':`${COOKIE}=${token()}; Path=/; Max-Age=${TTL}; Secure; HttpOnly; SameSite=Strict`});
      }
      const cookie = String(req.headers.cookie ?? '').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`));
      let authenticated = validToken(cookie?.slice(COOKIE.length+1) ?? '');
      // Preserve scripted smoke tests without sending a WWW-Authenticate challenge.
      if (!authenticated && String(req.headers.authorization ?? '').startsWith('Basic ')) {
        if (!allowed(ip)) return send(429, 'Too many attempts', {'Retry-After':'900'});
        const basic = Buffer.from(req.headers.authorization.slice(6), 'base64').toString();
        const split = basic.indexOf(':');
        authenticated = split > 0 && await credentials(basic.slice(0, split), basic.slice(split+1));
      }
      if (!authenticated) return url.pathname.startsWith('/api/')
        ? send(401, '{"error":"PREVIEW_LOGIN_REQUIRED"}', {'Content-Type':'application/json'})
        : send(302, '', {Location:'/__preview/login'});
      const headers = {...req.headers};
      delete headers.authorization;
      headers.cookie = String(req.headers.cookie ?? '').split(';').filter(x=>!x.trim().startsWith(`${COOKIE}=`)).join(';');
      const upstream = http.request(new URL(config.upstream), {path:req.url, method:req.method, headers}, response => {
        res.writeHead(response.statusCode, {...response.headers,'X-Robots-Tag':'noindex, nofollow'});
        response.pipe(res);
      });
      upstream.setTimeout(30000, ()=>upstream.destroy());
      upstream.on('error', ()=> { if (!res.headersSent) send(502, 'سرویس در حال آماده شدن است. دوباره تلاش کنید.'); else res.destroy(); });
      req.on('aborted', ()=>upstream.destroy()); req.pipe(upstream);
    } catch { if (!res.headersSent) send(400, 'درخواست معتبر نیست.'); else res.destroy(); }
  });
  server.on('close', ()=>clearInterval(cleanup));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createGate({host:process.env.PREVIEW_HOST,passwordHash:process.env.PREVIEW_GATE_HASH ?? '',
    sessionKey:process.env.PREVIEW_GATE_KEY ?? '',upstream:process.env.PREVIEW_UPSTREAM ?? 'http://web:3000'})
    .listen(8080,'0.0.0.0');
}
