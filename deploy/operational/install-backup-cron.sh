#!/usr/bin/env bash
set -euo pipefail
umask 077
command -v crontab >/dev/null
task=/home/manage/operations/backup-operational.sh
bash -n "$task"
tmp=$(mktemp /home/manage/operations/cron.XXXXXX)
trap 'rm -f "$tmp"' EXIT
crontab -l > "$tmp" 2>/dev/null || true
if ! grep -Fq '# manage-operational-backup' "$tmp"; then
  printf '\n30 0 * * * /bin/bash %s >> /home/manage/backups/operational/backup.log 2>&1 # manage-operational-backup\n' "$task" >> "$tmp"
  crontab "$tmp"
fi
crontab -l | grep -F '# manage-operational-backup'
