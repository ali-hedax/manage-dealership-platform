#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/home/manage/backups/operational
mkdir -p "$root"
exec 9>"$root/.backup.lock"
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$root/$stamp"
mkdir "$target"
docker exec manage-db-1 pg_dump -U manage -d manage -Fc > "$target/db.dump.part"
docker exec -i manage-db-1 pg_restore -l < "$target/db.dump.part" > "$target/db.list"
mv "$target/db.dump.part" "$target/db.dump"
cp -p /opt/manage/.env "$target/env"
tar czf "$target/operations.tgz" -C /home/manage operations
git -C /opt/manage rev-parse HEAD > "$target/app-commit.txt"
docker inspect --format '{{.Image}}' manage-api-1 manage-web-1 > "$target/image-ids.txt"
(cd "$target" && sha256sum db.dump env operations.tgz > SHA256SUMS)
ln -sfn "$target" "$root/latest"
printf 'Backup OK: %s\n' "$stamp"
# Deliberately no automatic deletion. Review capacity before adding retention.
