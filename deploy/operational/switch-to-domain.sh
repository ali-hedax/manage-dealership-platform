#!/usr/bin/env bash
# One-time switch of the production VM to https://managebyhedax.ir. Run as the
# manage user, only after renew-certificate.mjs has installed the real certificate:
#   bash switch-to-domain.sh /path/to/Caddyfile.production
# Restarts api and gate with the same images (no build, no pull, no migration).
# Rollback: restore env and Caddyfile from the printed backup directory, then
# recreate the same services and reload Caddy.
set -euo pipefail
umask 077

domain=managebyhedax.ir
ops=/home/manage/operations
env_file=/opt/manage/.env
source_file=${1:?usage: switch-to-domain.sh <Caddyfile.production>}
cert=$ops/tls/fullchain.pem

# Refuse to send staff to an address without a publicly trusted certificate.
openssl x509 -in "$cert" -noout -checkend 604800 >/dev/null
issuer=$(openssl x509 -in "$cert" -noout -issuer)
case "$issuer" in
  *STAGING*|*"(STAGING)"*) echo "staging certificate: $issuer" >&2; exit 1 ;;
  *"Let's Encrypt"*) ;;
  *) echo "unexpected issuer: $issuer" >&2; exit 1 ;;
esac
names=$(openssl x509 -in "$cert" -noout -ext subjectAltName)
for name in "DNS:$domain" "DNS:www.$domain"; do
  grep -q "$name" <<<"$names" || { echo "certificate does not cover $name" >&2; exit 1; }
done

docker run --rm --pull never --network none \
  -v "$source_file:/etc/caddy/Caddyfile:ro" -v "$ops/tls:/etc/caddy/tls:ro" caddy:2-alpine \
  caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
  || { echo "Caddyfile did not validate" >&2; exit 1; }

bash "$ops/backup-operational.sh"
backup=/home/manage/backups/domain-switch-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$backup"
cp -p "$env_file" "$backup/env"
cp -p "$ops/caddy/Caddyfile" "$backup/Caddyfile"

sed -i -E \
  -e "s#^PREVIEW_HOST=.*#PREVIEW_HOST=$domain#" \
  -e "s#^PUBLIC_APP_URL=.*#PUBLIC_APP_URL=https://$domain#" \
  "$env_file"

bash "$ops/operational-compose.sh" up -d --no-build --pull never --no-deps --wait --wait-timeout 180 api gate
# In place: the Caddyfile is a single-file bind mount and must keep its inode.
cat "$source_file" > "$ops/caddy/Caddyfile"
docker exec manage-caddy-1 caddy reload --config /etc/caddy/Caddyfile --force >/dev/null 2>&1

echo "Switched to https://$domain. Backup: $backup"
