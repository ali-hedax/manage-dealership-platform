import type { NextRequest } from 'next/server';

// Runtime proxy to the API. The browser only talks to this origin, so the
// session cookie stays first-party and no CORS is needed. Unlike next.config
// rewrites (fixed at build time), API_INTERNAL_URL is read per request, so one
// image works in every environment.
export const dynamic = 'force-dynamic';

const FORWARD_REQUEST = [
  'accept',
  'content-type',
  'cookie',
  'idempotency-key',
  'user-agent',
  'x-forwarded-for',
  'x-manage-client',
  'x-request-id',
];
const DROP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  const target = `${base}/api/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      { statusCode: 502, code: 'API_UNREACHABLE', message: 'سرویس Manage در دسترس نیست. چند لحظه بعد دوباره تلاش کنید.' },
      { status: 502 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROP_RESPONSE.has(name)) out.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
