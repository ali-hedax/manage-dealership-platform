#!/usr/bin/env bash
# READ-ONLY check of the production image pins (2026-11-27, after the :latest incident).
# For each production container: the image it is running, the image name its compose config
# names (the pinned prod-<version> tag), what that name resolves to now, and every tag pointing at
# the running image. Changes nothing. Exit 0 = every pin resolves to the running image; 1 = mismatch.
#   bash /home/manage/operations/check-production-images.sh   (installed there; /opt/manage must stay clean)
set -uo pipefail
status=0
short() { echo "${1#sha256:}" | cut -c1-12; }
printf '%-16s %-14s %-28s %-14s %s\n' container running pinned-name pin-resolves verdict
for c in manage-api-1 manage-web-1 manage-pulse-1; do
  run="$(docker inspect -f '{{.Image}}' "$c" 2>/dev/null)" || { printf '%-16s %s\n' "$c" 'NOT RUNNING'; status=1; continue; }
  svc="${c#manage-}"; svc="${svc%-1}"
  pinned="$(bash /home/manage/operations/operational-compose.sh config --format json 2>/dev/null \
    | python3 -I -c "import json,sys; print(json.load(sys.stdin)['services']['$svc'].get('image',''))")"
  resolved="$(docker image inspect -f '{{.Id}}' "$pinned" 2>/dev/null || echo none)"
  verdict=OK
  [[ "$pinned" == *:prod-* ]] || verdict='NOT PINNED (no prod-* tag)'
  [ "$resolved" = "$run" ] || verdict='MISMATCH'
  [ "$verdict" = OK ] || status=1
  printf '%-16s %-14s %-28s %-14s %s\n' "$c" "$(short "$run")" "$pinned" "$(short "$resolved")" "$verdict"
  echo "                 tags on running image: $(docker image ls --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}' | awk -v id="$run" '$2==id{print $1}' | tr '\n' ' ')"
done
echo "production repository tags:"
for repo in manage-api manage-web; do
  docker image ls "$repo" --no-trunc --format '  {{.Repository}}:{{.Tag}} {{.ID}}' | sed -E 's/sha256:([0-9a-f]{12})[0-9a-f]+/\1/'
done
exit $status
