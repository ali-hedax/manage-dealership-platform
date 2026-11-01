#!/usr/bin/env bash
# Deploys (or updates) the Manage Preview on the VM prepared by setup-server.sh.
#   bash /opt/manage/deploy/preview/deploy.sh [git-ref]
# Builds the images on the VM, applies database migrations (the API runs them
# on start), and waits until the site answers through Caddy.
set -euo pipefail

APP_DIR=/opt/manage
REF="${1:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"
COMPOSE=(docker compose -f docker-compose.yml -f deploy/preview/docker-compose.preview.yml)
cd "$APP_DIR"
if grep -q '^PREVIEW_GATE_HASH=' .env 2>/dev/null; then
  COMPOSE+=(-f deploy/preview/docker-compose.form-gate.yml)
fi

test -f .env || { echo ".env missing: run setup-server.sh first" >&2; exit 1; }
test -f deploy/preview/auth.caddy || { echo "auth.caddy missing: run setup-server.sh first" >&2; exit 1; }

echo "== code: $REF"
git fetch --quiet origin "$REF"
git checkout --quiet "$REF"
git reset --quiet --hard "origin/$REF"
git log --oneline -1

echo "== build and start"
# NPM_REGISTRY (optional, in .env) points the image build at an npm mirror.
"${COMPOSE[@]}" build --pull
"${COMPOSE[@]}" up -d --remove-orphans
docker image prune -f >/dev/null

echo "== health"
host="$(grep '^PREVIEW_HOST=' .env | cut -d= -f2)"
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T api node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    code="$(curl -s -o /dev/null -w '%{http_code}' "https://${host}/login" || true)"
    if [ "$code" != 401 ] && [ "$code" != 302 ]; then
      echo "Preview gate check failed: unexpected HTTP ${code}" >&2
      exit 1
    fi
    echo "API healthy; https://${host}/login answers ${code} (401 = legacy gate, 302 = form gate)"
    "${COMPOSE[@]}" ps
    exit 0
  fi
  sleep 5
done
echo "API did not become healthy" >&2
"${COMPOSE[@]}" logs --tail 80 api >&2
exit 1
