#!/usr/bin/env node
// Obtains the Let's Encrypt certificate for managebyhedax.ir from a workstation.
//
// The Manage VM has no route to any ACME server, so this RFC 8555 client runs
// where Let's Encrypt is reachable. The private key is generated on the VM over
// SSH and never leaves it. No dependencies; needs Node 22+ and an ssh client.
//
// DNS-01 (works while the VM is unreachable from outside Iran):
//   node deploy/operational/renew-certificate.mjs --dns-prepare   prints the two TXT records to add
//   node deploy/operational/renew-certificate.mjs --dns-finish    validates, issues and installs
// HTTP-01 (only when Let's Encrypt can reach port 80 of the VM):
//   node deploy/operational/renew-certificate.mjs                 issue and install
//   node deploy/operational/renew-certificate.mjs --if-expiring-in 30   do nothing while still valid
// Add --dry-run to use the staging CA and install nothing.
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DOMAINS = ['managebyhedax.ir', 'www.managebyhedax.ir'];
const HOST = process.env.MANAGE_SSH_HOST ?? 'manage@85.198.52.255';
const SSH_KEY = process.env.MANAGE_SSH_KEY ?? join(homedir(), '.ssh', 'manage_preview_ed25519');
const STATE_DIR = process.env.MANAGE_ACME_DIR ?? join(homedir(), '.manage-acme');
const OPS = '/home/manage/operations';
const TLS = `${OPS}/tls`;
const WEBROOT = `${OPS}/acme-webroot`;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ifExpiring = args.includes('--if-expiring-in') ? Number(args[args.indexOf('--if-expiring-in') + 1]) : null;
const CA = dryRun
  ? 'https://acme-staging-v02.api.letsencrypt.org/directory'
  : 'https://acme-v02.api.letsencrypt.org/directory';

const b64u = (value) => Buffer.from(value).toString('base64url');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function remote(script) {
  const result = spawnSync('ssh', ['-i', SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', HOST, 'bash -s'], {
    input: `set -euo pipefail\numask 077\n${script}\n`,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Remote step failed: ${result.stderr || result.error}`);
  return result.stdout;
}

function accountKey() {
  mkdirSync(STATE_DIR, { recursive: true });
  const path = join(STATE_DIR, dryRun ? 'account-staging.jwk.json' : 'account.jwk.json');
  if (!existsSync(path)) {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    writeFileSync(path, JSON.stringify(privateKey.export({ format: 'jwk' })), { mode: 0o600 });
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

class Acme {
  constructor(jwk, directory) {
    this.key = { key: jwk, format: 'jwk' };
    this.publicJwk = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
    this.directory = directory;
    this.thumbprint = createHash('sha256').update(JSON.stringify(this.publicJwk)).digest('base64url');
  }
  async nonce() {
    const response = await fetch(this.directory.newNonce, { method: 'HEAD' });
    return response.headers.get('replay-nonce');
  }
  // POST-as-GET when payload is undefined.
  async post(url, payload) {
    for (let attempt = 0; ; attempt++) {
      const header = { alg: 'ES256', nonce: await this.nonce(), url };
      if (this.kid) header.kid = this.kid;
      else header.jwk = this.publicJwk;
      const protectedB64 = b64u(JSON.stringify(header));
      const payloadB64 = payload === undefined ? '' : b64u(JSON.stringify(payload));
      const signature = sign('sha256', Buffer.from(`${protectedB64}.${payloadB64}`), { ...this.key, dsaEncoding: 'ieee-p1363' });
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/jose+json' },
        body: JSON.stringify({ protected: protectedB64, payload: payloadB64, signature: signature.toString('base64url') }),
      });
      const text = await response.text();
      const json = text.startsWith('{') ? JSON.parse(text) : null;
      if (response.ok) return { json, text, location: response.headers.get('location') };
      if (json?.type === 'urn:ietf:params:acme:error:badNonce' && attempt < 3) continue;
      throw new Error(`ACME ${url} -> ${response.status}: ${json?.detail ?? text}`);
    }
  }
  async poll(url, done) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const { json } = await this.post(url);
      if (json.status === 'invalid') {
        const reason = json.challenges?.find((challenge) => challenge.error)?.error ?? json.error ?? json;
        throw new Error(`ACME validation failed: ${JSON.stringify(reason)}`);
      }
      if (done(json.status)) return json;
      await sleep(3000);
    }
    throw new Error(`Timed out waiting for ${url}`);
  }
}

function currentCertificateDaysLeft() {
  const out = remote(`if [ -f ${TLS}/fullchain.pem ]; then openssl x509 -in ${TLS}/fullchain.pem -noout -enddate; fi`).trim();
  if (!out) return null;
  return (new Date(out.replace('notAfter=', '')).getTime() - Date.now()) / 86400000;
}

const dnsOrderPath = () => join(STATE_DIR, dryRun ? 'dns-order-staging.json' : 'dns-order.json');

async function connect() {
  const directory = await (await fetch(CA)).json();
  const acme = new Acme(accountKey(), directory);
  const account = await acme.post(directory.newAccount, { termsOfServiceAgreed: true });
  acme.kid = account.location;
  return acme;
}

async function dnsPrepare() {
  const acme = await connect();
  const order = await acme.post(acme.directory.newOrder, { identifiers: DOMAINS.map((value) => ({ type: 'dns', value })) });
  const records = [];
  for (const url of order.json.authorizations) {
    const { json: authz } = await acme.post(url);
    const challenge = authz.challenges.find((candidate) => candidate.type === 'dns-01');
    const value = createHash('sha256').update(`${challenge.token}.${acme.thumbprint}`).digest('base64url');
    records.push({ name: `_acme-challenge.${authz.identifier.value}`, value, authz: url, challenge: challenge.url, expires: authz.expires });
  }
  writeFileSync(dnsOrderPath(), JSON.stringify({ order: order.location, finalize: order.json.finalize, records }, null, 2), { mode: 0o600 });
  for (const record of records) console.log(`TXT  ${record.name}  ${record.value}  (valid until ${record.expires})`);
}

// Asks the domain's own nameservers, the same answer Let's Encrypt will get.
async function publicTxt(name) {
  const servers = [];
  for (const host of await dns.resolveNs(DOMAINS[0])) servers.push(...(await dns.resolve4(host)));
  const resolver = new dns.Resolver();
  resolver.setServers(servers);
  try {
    return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(''));
  } catch (error) {
    if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') return [];
    throw error;
  }
}

async function dnsFinish() {
  const saved = JSON.parse(readFileSync(dnsOrderPath(), 'utf8'));
  // A failed validation counts against the Let's Encrypt limit, so look first.
  for (const record of saved.records) {
    if (!(await publicTxt(record.name)).includes(record.value)) {
      throw new Error(`TXT record not visible yet: ${record.name}. Nothing was submitted; retry later.`);
    }
  }
  const acme = await connect();
  for (const record of saved.records) {
    const { json: authz } = await acme.post(record.authz);
    if (authz.status !== 'valid') {
      await acme.post(record.challenge, {});
      await acme.poll(record.authz, (status) => status === 'valid');
    }
    console.log(`Validated ${authz.identifier.value}`);
  }
  await issue(acme, saved.finalize, saved.order);
}

async function main() {
  if (args.includes('--dns-prepare')) return dnsPrepare();
  if (args.includes('--dns-finish')) return dnsFinish();
  if (ifExpiring !== null) {
    if (!Number.isFinite(ifExpiring)) throw new Error('--if-expiring-in needs a number of days');
    const left = currentCertificateDaysLeft();
    if (left !== null && left > ifExpiring) {
      console.log(`Certificate still valid for ${Math.floor(left)} days; nothing to do.`);
      return;
    }
  }
  const acme = await connect();
  const order = await acme.post(acme.directory.newOrder, { identifiers: DOMAINS.map((value) => ({ type: 'dns', value })) });
  const tokens = [];
  try {
    for (const url of order.json.authorizations) {
      const { json: authz } = await acme.post(url);
      if (authz.status === 'valid') continue;
      const challenge = authz.challenges.find((candidate) => candidate.type === 'http-01');
      if (!/^[A-Za-z0-9_-]+$/.test(challenge.token)) throw new Error('Unexpected ACME token');
      tokens.push(challenge.token);
      remote(`printf %s '${challenge.token}.${acme.thumbprint}' > ${WEBROOT}/${challenge.token}; chmod 644 ${WEBROOT}/${challenge.token}`);
      await acme.post(challenge.url, {});
      await acme.poll(url, (status) => status === 'valid');
      console.log(`Validated ${authz.identifier.value}`);
    }
  } finally {
    if (tokens.length) remote(`cd ${WEBROOT} && rm -f ${tokens.join(' ')}`);
  }
  await issue(acme, order.json.finalize, order.location);
}

async function issue(acme, finalizeUrl, orderUrl) {
  // The private key is created on the VM; only the CSR comes back.
  const san = DOMAINS.map((domain) => `DNS:${domain}`).join(',');
  const csrPem = remote(`openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout ${TLS}/privkey.pending.pem -subj /CN=${DOMAINS[0]} -addext subjectAltName=${san} -outform PEM 2>/dev/null`);
  const csr = Buffer.from(csrPem.replace(/-----[^-]+-----|\s/g, ''), 'base64').toString('base64url');
  await acme.post(finalizeUrl, { csr });
  const finished = await acme.poll(orderUrl, (status) => status === 'valid');
  const { text: chain } = await acme.post(finished.certificate);

  if (dryRun) {
    remote(`rm -f ${TLS}/privkey.pending.pem`);
    console.log('Dry run succeeded against the staging CA; nothing was installed.');
    return;
  }

  // Installed only if certificate and key match; the previous pair stays beside it.
  const installed = remote(`
cat > ${TLS}/fullchain.pending.pem <<'CERT'
${chain.trim()}
CERT
cert_key=$(openssl x509 -in ${TLS}/fullchain.pending.pem -noout -pubkey | openssl sha256)
priv_key=$(openssl pkey -in ${TLS}/privkey.pending.pem -pubout | openssl sha256)
[ "$cert_key" = "$priv_key" ] || { echo "certificate does not match key" >&2; exit 1; }
openssl x509 -in ${TLS}/fullchain.pending.pem -noout -checkend 86400 >/dev/null
for name in fullchain privkey; do
  if [ -f ${TLS}/$name.pem ]; then cp -p ${TLS}/$name.pem ${TLS}/$name.previous.pem; fi
  mv ${TLS}/$name.pending.pem ${TLS}/$name.pem
done
docker exec manage-caddy-1 caddy reload --config /etc/caddy/Caddyfile --force >/dev/null 2>&1 || { echo "caddy reload failed" >&2; exit 1; }
openssl x509 -in ${TLS}/fullchain.pem -noout -issuer -enddate -ext subjectAltName
`);
  console.log(installed.trim());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
