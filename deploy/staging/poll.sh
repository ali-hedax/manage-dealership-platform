#!/usr/bin/env bash
# Auto-deploy for STAGING (cron every 5 minutes, installed by setup.sh). Does nothing until the
# owner puts a read-only GitHub token in /home/manage/manage-staging/secrets/github-token (fine-grained,
# this repository only, permission «Actions: Read»). Then: newest successful CI run of a push to
# `rebuild` → its preview-images artifact → deploy.sh. The token never appears on a command line.
set -euo pipefail
umask 077
ROOT=/home/manage/manage-staging
[ -s "$ROOT/secrets/github-token" ] || exit 0
exec 8>"$ROOT/state/poll.lock"
flock -n 8 || exit 0
plan="$(python3 -I "$ROOT/bin/poll-github.py")" || { echo "$(date -u +%FT%TZ) poll failed"; exit 0; }
[ -n "$plan" ] || exit 0
sha="${plan%% *}"
[ "$sha" = "$(cat "$ROOT/state/deployed.sha" 2>/dev/null)" ] && exit 0
echo "$(date -u +%FT%TZ) new rebuild commit $sha"
bash "$ROOT/bin/deploy.sh" "$sha"
