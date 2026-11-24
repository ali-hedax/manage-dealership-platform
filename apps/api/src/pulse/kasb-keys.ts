import { KasbError } from './kasb-errors';

// The two RSA keys of the site are public: they ship in the React bundle
// (/static/js/main.<hash>.chunk.js) inside the env object as REACT_APP_PUBLIC_KEY (server
// public key, SPKI) and REACT_APP_PRIVATE_KEY (client private key, PKCS#8). They are never
// hard-coded: the worker reads /home, finds the bundle, extracts both and caches them until a
// decryption fails or /version.txt changes.

const CHUNK_RE = /(?:^|["'(\s=/])(?:\.\/)?\/?(static\/js\/main\.[A-Za-z0-9]+\.chunk\.js)/;

/** Path of the main bundle referenced by the /home page, e.g. /static/js/main.1a2b3c4d.chunk.js. */
export function findMainChunk(html: string): string | null {
  const m = CHUNK_RE.exec(html);
  return m ? `/${m[1]}` : null;
}

const literal = (name: string) => new RegExp(`["']?${name}["']?\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)`);

/** Value of a JavaScript string literal (the escapes minifiers produce). */
export function unescapeJs(quoted: string): string {
  const body = quoted.slice(1, -1);
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e: string) => {
    if (e.startsWith('u{')) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' } as Record<string, string>)[e] ?? e;
  });
}

export interface BundleKeys {
  publicKey: string;
  privateKey: string;
}

/** Both keys of the env object in the bundle; KASB_KEYS when either is missing. */
export function extractKeys(bundle: string): BundleKeys {
  const pub = literal('REACT_APP_PUBLIC_KEY').exec(bundle);
  const priv = literal('REACT_APP_PRIVATE_KEY').exec(bundle);
  const publicKey = pub ? unescapeJs(pub[1]!).trim() : '';
  const privateKey = priv ? unescapeJs(priv[1]!).trim() : '';
  if (publicKey.length < 64 || privateKey.length < 64) throw new KasbError('KASB_KEYS');
  return { publicKey, privateKey };
}

/** Allowlisted service paths no longer found in the bundle (a sign the site changed its API). */
export function missingServicePaths(bundle: string, paths: Iterable<string>): string[] {
  // The bundle builds some paths from a prefix (Path: n + "RepairCard/Drcds/q" with n = "Srv/rcpt/"),
  // so a path counts as present when its last three segments appear in quotes.
  return [...paths].filter((p) => {
    if (bundle.includes(p)) return false;
    const tail = p.split('/').filter(Boolean).slice(-3).join('/');
    return !(tail.split('/').length === 3 && bundle.includes(`"${tail}"`));
  });
}
