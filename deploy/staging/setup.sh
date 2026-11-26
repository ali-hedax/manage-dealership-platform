#!/usr/bin/env bash
# One-time (idempotent) setup of STAGING on the production machine. Run by the owner-approved
# production key from a copy of deploy/staging/ in /home/manage/incoming/staging-setup-*/.
# Changes on the machine, and nothing else:
#  1. /home/manage/manage-staging/{bin,secrets,state,artifacts} (mode 700) with the fixed scripts.
#  2. Staging secrets, generated here (never in git): database, sessions, Pulse key, the demo
#     password of the staging accounts and the separate password layer.
#  3. One authorized_keys line: the staging-only key, forced to staging-gate.sh, no shell.
#  4. One new site block «staging.managebyhedax.ir» appended to the production Caddyfile; the
#     existing blocks are not edited. Backup first, validated in the Caddy container, graceful
#     reload, production checked; on any failure the backup is restored and reloaded.
#  5. A cron line for poll.sh (idle until the owner adds a read-only GitHub token).
set -euo pipefail
umask 077
SRC="$(cd "$(dirname "$0")" && pwd)"
ROOT=/home/manage/manage-staging
CADDY=/home/manage/operations/caddy/Caddyfile
BK="/home/manage/backups/staging-setup-$(date -u +%Y%m%dT%H%M%SZ)"
code() { curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }
prod_ok() {
  [ "$(code --resolve managebyhedax.ir:443:127.0.0.1 https://managebyhedax.ir/login)" = 200 ] &&
  [ "$(code --resolve managebyhedax.ir:443:127.0.0.1 https://managebyhedax.ir/api/v1/cases)" = 401 ]
}
rand() { python3 -I -c "import secrets; print(secrets.token_urlsafe($1))"; }
prod_ok || { echo "production is not answering normally; nothing changed" >&2; exit 1; }

# 1. Folders and fixed scripts.
mkdir -p "$ROOT/bin" "$ROOT/secrets" "$ROOT/state" "$ROOT/artifacts"
chmod 700 "$ROOT" "$ROOT/bin" "$ROOT/secrets" "$ROOT/state" "$ROOT/artifacts"
for f in deploy.sh staging-gate.sh poll.sh smoke.sh; do install -m 700 "$SRC/$f" "$ROOT/bin/$f"; done
for f in load-images.py fetch-artifact.py poll-github.py docker-compose.staging.yml; do install -m 600 "$SRC/$f" "$ROOT/bin/$f"; done

# 2. Secrets (kept when they already exist).
if [ ! -f "$ROOT/secrets/api.env" ]; then
  dbpw="$(rand 32)"
  printf 'POSTGRES_USER=manage_staging\nPOSTGRES_DB=manage_staging\nPOSTGRES_PASSWORD=%s\n' "$dbpw" > "$ROOT/secrets/db.env"
  demo="$(rand 15)"
  {
    echo "APP_ENV=preview"
    echo "NODE_ENV=production"
    echo "DB_DRIVER=postgres"
    echo "DATABASE_URL=postgres://manage_staging:$dbpw@staging-db:5432/manage_staging"
    echo "AUTH_TOKEN_SECRET=$(rand 48)"
    echo "PUBLIC_APP_URL=https://staging.managebyhedax.ir"
    echo "COOKIE_SECURE=true"
    echo "TOTP_AUTH_ENABLED=false"
    echo "PULSE_ENABLED=true"
    echo "PULSE_SECRET_KEY=$(rand 48)"
    echo "SEED_DEMO_PASSWORD=$demo"
  } > "$ROOT/secrets/api.env"
  printf 'username: admin (and the other demo accounts)\npassword: %s\n' "$demo" > "$ROOT/secrets/staging-accounts.txt"
fi
if [ ! -f "$ROOT/secrets/basic-auth.txt" ]; then
  printf 'staging:%s\n' "$(rand 18)" > "$ROOT/secrets/basic-auth.txt"
fi
chmod 600 "$ROOT"/secrets/*

# 3. Staging-only key, forced to the gate.
key="$(cat "$SRC/staging-gate.pub")"
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ claude-code-staging-gate$ ]] || { echo "unexpected public key" >&2; exit 1; }
if ! grep -qF "$(cut -d' ' -f2 <<<"$key")" ~/.ssh/authorized_keys; then
  echo "command=\"$ROOT/bin/staging-gate.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $key" >> ~/.ssh/authorized_keys
fi

# 4. Site block (once).
if ! grep -q '^staging\.managebyhedax\.ir {' "$CADDY"; then
  mkdir -p "$BK" && chmod 700 "$BK"
  cp -p "$CADDY" "$BK/Caddyfile"
  pw="$(cut -d: -f2- "$ROOT/secrets/basic-auth.txt")"
  hash="$(docker exec -e P="$pw" manage-caddy-1 sh -c 'caddy hash-password --plaintext "$P"')"
  [[ "$hash" =~ ^\$2[aby]\$[0-9]+\$[./A-Za-z0-9]+$ ]] || { echo "password hash failed" >&2; exit 1; }
  new="$(mktemp)"
  cat "$CADDY" > "$new"
  sed "s#__STAGING_BASIC_AUTH_HASH__#$hash#" "$SRC/Caddyfile.staging-block" >> "$new"
  docker exec -i manage-caddy-1 sh -c 'cat > /tmp/Caddyfile.staging-check && caddy validate --config /tmp/Caddyfile.staging-check --adapter caddyfile' < "$new"
  cat "$new" > "$CADDY"   # in place: the container sees the bind-mounted file, not a new inode
  rm -f "$new"
  if ! docker exec manage-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || ! prod_ok; then
    cat "$BK/Caddyfile" > "$CADDY"
    docker exec manage-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true
    echo "site block failed; the previous Caddyfile is back (backup: $BK)" >&2
    exit 1
  fi
  echo "site block added; backup of the previous Caddyfile: $BK/Caddyfile"
fi

# 5. Auto-deploy poller (idle without a token).
if ! crontab -l 2>/dev/null | grep -q 'manage-staging-poll'; then
  { crontab -l 2>/dev/null; echo "*/5 * * * * /bin/bash $ROOT/bin/poll.sh >> $ROOT/state/poll.log 2>&1 # manage-staging-poll"; } | crontab -
fi

prod_ok || { echo "WARNING: production check failed after setup" >&2; exit 1; }
echo "staging setup complete; production answers normally"
