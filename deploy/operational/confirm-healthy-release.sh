#!/usr/bin/env bash
# Finalize an ALREADY DEPLOYED production release. This does not deploy images.
# Run only after the release's backup, verified CI artifacts and smoke tests.
set -euo pipefail
cd /opt/manage
expected="${1:-}"
if [[ ! "$expected" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Usage: bash deploy/operational/confirm-healthy-release.sh <full-40-character-deployed-main-sha>" >&2
  exit 2
fi
container="$(bash deploy/operational/operational-compose.sh ps -q api)"
if [[ -z "$container" ]]; then echo "API container is not running" >&2; exit 1; fi
# Check LIVE health, require a matching image commit, then persist the version.
# Fail closed if this deploy has no commit metadata or the server is unhealthy.
docker exec -i "$container" node - "$expected" <<'NODE'
const {execFileSync} = require('node:child_process');
const expected = process.argv[2].toLowerCase();
const url = 'http://127.0.0.1:4000/api/v1/health';
async function health() {
  const res = await fetch(url, {signal: AbortSignal.timeout(8000), cache: 'no-store'});
  if (!res.ok) throw Error('API health HTTP ' + res.status);
  return res.json();
}
(async () => {
  const before = await health();
  const running = String(before.commit ?? '').trim().toLowerCase();
  if (before.status !== 'ok' || before.db !== 'ok' || running !== expected)
    throw Error('Release NOT confirmed: unhealthy API or deployed commit does not match expected SHA');
  const confirmed = JSON.parse(execFileSync(process.execPath,
    ['dist/scripts/confirm-release.js'], {encoding:'utf8',timeout:20000}).trim());
  const after = await health();
  if (!confirmed.version || after.version !== confirmed.version || String(after.commit).toLowerCase() !== expected)
    throw Error('Release confirmation failed verification: version/commit mismatch');
  console.log(JSON.stringify({ok:true,commit:expected,version:after.version,created:confirmed.created}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
NODE
