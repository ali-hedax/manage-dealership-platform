#!/usr/bin/env bash
# The only way Claude Code may reach the staging stack (see .claude/settings.json).
#
# Staging runs isolated on the production machine (owner decision, 2026-11-26). This script uses
# the staging-only key ~/.ssh/manage_staging_gate_ed25519. On the server that key is accepted only
# with a forced command (/home/manage/manage-staging/bin/staging-gate.sh), so it can run the gate's fixed
# staging operations and nothing else: no shell, no production containers, no production database.
#
#   staging.sh status
#   staging.sh logs <api|web|pulse|db>
#   staging.sh fetch-artifact <full sha> <size> <sha256>   (signed artifact URL on stdin)
#   staging.sh deploy <full sha>
#   staging.sh rollback
#   staging.sh smoke
set -euo pipefail
cd "$(dirname "$0")/../.."
conf=deploy/staging/target.env
[ -f "$conf" ] || { echo "Refused: $conf is missing (staging not configured yet)" >&2; exit 2; }
# shellcheck disable=SC1090
. "$conf"
: "${STAGING_HOST:?}" "${STAGING_USER:?}"
key="$HOME/.ssh/manage_staging_gate_ed25519"
[ -f "$key" ] || { echo "Refused: staging key $key is missing" >&2; exit 2; }
case "${1:-}" in
  status|logs|fetch-artifact|deploy|rollback|smoke) ;;
  *) echo "usage: staging.sh status|logs|fetch-artifact|deploy|rollback|smoke ..." >&2; exit 2 ;;
esac
for a in "$@"; do [[ "$a" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Refused: argument '$a'" >&2; exit 2; }; done
exec ssh -i "$key" -o IdentitiesOnly=yes -o UserKnownHostsFile="$HOME/.ssh/known_hosts_manage_preview" \
  -o BatchMode=yes -o ConnectTimeout=20 "$STAGING_USER@$STAGING_HOST" "$*"
