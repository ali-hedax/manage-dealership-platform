#!/usr/bin/env bash
# Deploy one commit of the `rebuild` branch to STAGING (isolated stack «manage-staging» on the
# production machine). Installed at /home/manage/manage-staging/bin/ by setup.sh; run by the restricted
# gate or by poll.sh. Never touches production containers, images, tags, database or files:
#  - Staging images live only in their own repositories manage-staging-api / manage-staging-web
#    (:<sha>, :current, :previous). Production's manage-api / manage-web tags are never written.
#  - load-images.py renames CI archive names into those repositories, refuses any overlap with a
#    production tag and restores any production tag that moved; this script checks all of them again.
#  - Images a production release already loaded (manage-api:<sha>) only get a staging tag added.
# On failure the previous staging images are started again.
set -euo pipefail
umask 077
SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy.sh <full sha>" >&2; exit 2; }
ROOT=/home/manage/manage-staging
BIN="$ROOT/bin"
STATE="$ROOT/state"
ART="$ROOT/artifacts/$SHA"
exec 9>"$STATE/deploy.lock"
flock -w 600 9 || { echo "another staging deploy is running" >&2; exit 4; }
compose() { STAGING_SHA="$SHA" docker compose -p manage-staging -f "$BIN/docker-compose.staging.yml" "$@"; }
psql_staging() { docker exec -i manage-staging-staging-db-1 psql -X -qAt -v ON_ERROR_STOP=1 -U manage_staging -d manage_staging "$@"; }
log() { echo "$(date -u +%FT%TZ) $*"; }

prod_tags() {
  docker image ls manage-api --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}'
  docker image ls manage-web --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}'
}
prod_before="$(prod_tags | sort)"
check_prod() { [ "$(prod_tags | sort)" = "$prod_before" ] || { echo "ABORT: a production image tag changed" >&2; exit 9; }; }

# 1. Images for this commit (staging repositories only).
if docker image inspect "manage-staging-api:$SHA" "manage-staging-web:$SHA" >/dev/null 2>&1; then
  log "images already loaded"
elif docker image inspect "manage-api:$SHA" "manage-web:$SHA" >/dev/null 2>&1; then
  docker tag "manage-api:$SHA" "manage-staging-api:$SHA"
  docker tag "manage-web:$SHA" "manage-staging-web:$SHA"
  log "reused images of the production release $SHA"
else
  [ -f "$ART/preview-images.tar.gz" ] || { echo "no images for $SHA: run fetch-artifact first" >&2; exit 3; }
  [ "$(tr -d '[:space:]' < "$ART/preview-image-source.txt")" = "$SHA" ] || { echo "artifact is for another commit" >&2; exit 3; }
  (cd "$ART" && sha256sum -c --quiet preview-images.sha256)
  python3 -I "$BIN/load-images.py" "$ART/preview-images.tar.gz" "$SHA" || { check_prod; exit 3; }
  log "loaded images from the CI artifact"
fi
check_prod

# 2. Keep the running staging images for rollback, then switch the staging tags.
if docker image inspect manage-staging-api:current manage-staging-web:current >/dev/null 2>&1; then
  docker tag manage-staging-api:current manage-staging-api:previous
  docker tag manage-staging-web:current manage-staging-web:previous
  cp -f "$STATE/deployed.sha" "$STATE/previous.sha" 2>/dev/null || true
fi
docker tag "manage-staging-api:$SHA" manage-staging-api:current
docker tag "manage-staging-web:$SHA" manage-staging-web:current

rollback() {
  log "deploy failed; starting the previous staging images"
  if docker image inspect manage-staging-api:previous >/dev/null 2>&1 && [ -f "$STATE/previous.sha" ]; then
    docker tag manage-staging-api:previous manage-staging-api:current
    docker tag manage-staging-web:previous manage-staging-web:current
    STAGING_SHA="$(cat "$STATE/previous.sha")" docker compose -p manage-staging -f "$BIN/docker-compose.staging.yml" up -d --wait --wait-timeout 180 || true
  fi
}
trap 'rollback' ERR

# 3. Database, migrations, one-time synthetic seed, start.
compose up -d --wait --wait-timeout 120 staging-db
compose run --rm --no-deps staging-api node dist/scripts/migrate.js
if [ ! -f "$STATE/seeded" ]; then
  compose run --rm --no-deps staging-api node dist/scripts/seed-demo.js
  touch "$STATE/seeded"
fi
compose up -d --wait --wait-timeout 180 --remove-orphans

# 4. Health of the new commit.
health="$(docker exec manage-staging-staging-api-1 node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))")"
echo "$health" | grep -q "\"commit\":\"$SHA\"" || { echo "health does not report $SHA: $health" >&2; false; }
echo "$health" | grep -q '"status":"ok"' || { echo "unhealthy: $health" >&2; false; }
trap - ERR

# 5. Staging Pulse reads at most every 30 minutes (owner decision); read-only by design.
psql_staging -c "update pulse_connections set settings = jsonb_set(settings, '{intervalMinutes}', '30') where coalesce((settings->>'intervalMinutes')::int, 0) < 30;" || true

echo "$SHA" > "$STATE/deployed.sha"
# Old staging commit tags (staging repositories only; production repositories are never pruned here).
for repo in manage-staging-api manage-staging-web; do
  docker image ls "$repo" --format '{{.Repository}}:{{.Tag}}' | grep -E ':[0-9a-f]{40}$' | grep -v ":$SHA$" \
    | tail -n +4 | xargs -r docker image rm >/dev/null 2>&1 || true
done
check_prod
log "staging now runs $SHA"
echo "$health"
