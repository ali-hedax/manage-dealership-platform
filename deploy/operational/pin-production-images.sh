#!/usr/bin/env bash
# Pin PRODUCTION to immutable image tags (2026-11-27, after the :latest incident).
#   bash pin-production-images.sh <version>      e.g. 1.0.20
# 1. Backs up the production overlay, /opt/manage/.env, the compose files and the image list.
# 2. Tags the images the running containers use as manage-api:prod-<version> / manage-web:prod-<version>
#    (only adds tags; refuses if api and pulse run different images or the tag already points elsewhere).
# 3. Sets `image: manage-*:prod-<version>` + `pull_policy: never` for api, web and pulse in
#    /home/manage/operations/operational.yml (line insertion; other lines untouched).
# 4. Validates the compose config and confirms no container was restarted.
# Nothing is restarted: running containers hold image IDs, not tags. The pin applies from the next
# `compose up`. Every later release must update the pin (see docs/DEPLOYMENT.md).
set -euo pipefail
umask 077
V="${1:?usage: pin-production-images.sh <version>}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version like 1.0.20" >&2; exit 2; }
OV=/home/manage/operations/operational.yml
BK="/home/manage/backups/image-pin-$(date -u +%Y%m%dT%H%M%SZ)"
compose() { bash /home/manage/operations/operational-compose.sh "$@"; }
started() { docker inspect -f '{{.Name}} {{.State.StartedAt}}' manage-api-1 manage-web-1 manage-pulse-1; }

before_start="$(started)"
api="$(docker inspect -f '{{.Image}}' manage-api-1)"; web="$(docker inspect -f '{{.Image}}' manage-web-1)"; pulse="$(docker inspect -f '{{.Image}}' manage-pulse-1)"
[ "$api" = "$pulse" ] || { echo "REFUSED: api and pulse run different images" >&2; exit 3; }

# 1. Backup.
mkdir -p "$BK" && chmod 700 "$BK"
cp -p "$OV" "$BK/operational.yml"
cp -p /opt/manage/.env "$BK/opt-manage.env"
for f in docker-compose.yml deploy/preview/docker-compose.preview.yml deploy/preview/docker-compose.form-gate.yml; do cp -p "/opt/manage/$f" "$BK/$(echo "$f" | tr / _)"; done
docker image ls --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -E '^manage-' > "$BK/images-before.txt"
echo "backup: $BK"

# 2. Immutable tags on the running images (add only).
for pair in "manage-api:$api" "manage-web:$web"; do
  repo="${pair%%:*}"; id="${pair#*:}"; tag="$repo:prod-$V"
  existing="$(docker image inspect -f '{{.Id}}' "$tag" 2>/dev/null || true)"
  [ -z "$existing" ] || [ "$existing" = "$id" ] || { echo "REFUSED: $tag already points to another image" >&2; exit 3; }
  docker tag "$id" "$tag"
  echo "tagged $tag -> ${id:7:12}"
done

# 3. Overlay: image + pull_policy for api, pulse, web.
python3 -I - "$OV" "$V" <<'PY'
import re, sys
path, v = sys.argv[1], sys.argv[2]
text = open(path).read()
pins = {'api': f'manage-api:prod-{v}', 'pulse': f'manage-api:prod-{v}', 'web': f'manage-web:prod-{v}'}
for svc, image in pins.items():
    block = re.search(rf'(?m)^  {svc}:\n((?:    .*\n|\n)*)', text)
    lines = f'    image: {image}\n    pull_policy: never\n'
    if block:
        body = re.sub(r'(?m)^    (image|pull_policy):.*\n', '', block.group(1))
        text = text[:block.start()] + f'  {svc}:\n' + lines + body + text[block.end():]
    else:
        text = text.rstrip('\n') + f'\n  {svc}:\n' + lines
open(path, 'w').write(text)
PY

# 4. Validate; restore the backup if the config is invalid or names the wrong images.
images="$(compose config --images 2>&1)" || { cp -p "$BK/operational.yml" "$OV"; echo "config invalid, overlay restored: $images" >&2; exit 4; }
echo "$images" | grep -qx "manage-api:prod-$V" && echo "$images" | grep -qx "manage-web:prod-$V" \
  || { cp -p "$BK/operational.yml" "$OV"; echo "pin not effective, overlay restored" >&2; exit 4; }
[ "$(started)" = "$before_start" ] || { echo "WARNING: a production container start time changed" >&2; exit 5; }
echo "pinned to prod-$V; no container restarted"
