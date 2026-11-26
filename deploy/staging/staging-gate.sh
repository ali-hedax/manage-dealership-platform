#!/usr/bin/env bash
# Forced command of the staging-only SSH key (authorized_keys: command="…/staging-gate.sh").
# The key can run exactly these operations on the isolated «manage-staging» stack and nothing else:
#   status | logs <service> | fetch-artifact <sha> <size> <sha256> (signed URL on stdin)
#   deploy <sha> | rollback | smoke
# No shell, no arbitrary arguments, no production container, image, database or file.
set -euo pipefail
umask 077
ROOT=/home/manage/manage-staging
BIN="$ROOT/bin"
read -r -a argv <<< "${SSH_ORIGINAL_COMMAND:-}"
for a in "${argv[@]:-}"; do [[ "$a" =~ ^[A-Za-z0-9._-]*$ ]] || { echo "refused" >&2; exit 2; }; done
cmd="${argv[0]:-}"
sha_ok() { [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]; }
case "$cmd" in
  status)
    echo "deployed: $(cat "$ROOT/state/deployed.sha" 2>/dev/null || echo none)"
    docker ps --filter label=com.docker.compose.project=manage-staging --format '{{.Names}} {{.Status}}'
    docker exec manage-staging-staging-api-1 node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))" 2>/dev/null || echo "api: not running"
    tail -n 5 "$ROOT/state/poll.log" 2>/dev/null || true ;;
  logs)
    case "${argv[1]:-}" in api|web|pulse|db) ;; *) echo "logs api|web|pulse|db" >&2; exit 2;; esac
    docker logs --tail 150 "manage-staging-staging-${argv[1]}-1" 2>&1 ;;
  fetch-artifact)
    sha_ok "${argv[1]:-}" && [[ "${argv[2]:-}" =~ ^[0-9]+$ && "${argv[3]:-}" =~ ^[0-9a-f]{64}$ ]] || { echo "fetch-artifact <sha> <size> <sha256>" >&2; exit 2; }
    python3 -I "$BIN/fetch-artifact.py" "${argv[1]}" "${argv[2]}" "${argv[3]}" ;;
  deploy)
    sha_ok "${argv[1]:-}" || { echo "deploy <sha>" >&2; exit 2; }
    exec bash "$BIN/deploy.sh" "${argv[1]}" ;;
  rollback)
    prev="$(cat "$ROOT/state/previous.sha" 2>/dev/null)" && sha_ok "$prev" || { echo "no previous staging commit" >&2; exit 3; }
    exec bash "$BIN/deploy.sh" "$prev" ;;
  smoke)
    exec bash "$BIN/smoke.sh" ;;
  *) echo "commands: status | logs <svc> | fetch-artifact <sha> <size> <sha256> | deploy <sha> | rollback | smoke" >&2; exit 2 ;;
esac
