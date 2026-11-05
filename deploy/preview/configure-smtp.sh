#!/usr/bin/env bash
# Private SMTP setup for staff invitation email on the Manage Preview VM.
# Run it yourself over SSH as the `manage` user; the App Password is typed at a
# hidden prompt and never printed, logged or passed on a command line.
#
#   bash /opt/manage/deploy/preview/configure-smtp.sh            # enter, check, enable
#   bash /opt/manage/deploy/preview/configure-smtp.sh --check    # check current settings only
#   bash /opt/manage/deploy/preview/configure-smtp.sh --disable  # remove SMTP settings
#
# New settings are enabled only after the API image confirms connection, TLS
# and sender authentication from this server (no message is sent). The
# previous .env is backed up first. Only the API container is recreated; the
# database, Caddy, the site gate and every other setting stay untouched.
set -euo pipefail

APP_DIR=/opt/manage
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
cd "$APP_DIR"
COMPOSE=(docker compose -f docker-compose.yml -f deploy/preview/docker-compose.preview.yml)
if grep -q '^PREVIEW_GATE_HASH=' "$ENV_FILE" 2>/dev/null; then
  COMPOSE+=(-f deploy/preview/docker-compose.form-gate.yml)
fi
test -f "$ENV_FILE" || { echo ".env missing" >&2; exit 1; }

umask 077
tmp="$(mktemp)"
trap 'rm -f "$tmp" "$tmp.env"' EXIT

explain() {
  case "$1" in
    ready) echo "اتصال، TLS و احراز هویت فرستنده موفق بود (پیامی ارسال نشد)." ;;
    not_configured) echo "تنظیمات SMTP کامل نیست." ;;
    dns_failed) echo "نام سرور ایمیل از این سرور پیدا نشد (DNS)." ;;
    connection_blocked) echo "اتصال از این سرور به سرور ایمیل برقرار نشد (مسدود یا بدون پاسخ). مشکل شبکه سرور است، نه رمز." ;;
    tls_failed) echo "اتصال رمزنگاری‌شده (TLS) برقرار نشد." ;;
    auth_failed) echo "سرور ایمیل نام کاربری یا App Password را نپذیرفت." ;;
    *) echo "بررسی ناموفق بود (علت نامشخص)." ;;
  esac
}

# Runs check-mail.js in the current API image with the SMTP settings in $1.
check() {
  local image
  image="$(docker inspect --format '{{.Image}}' "$("${COMPOSE[@]}" ps -q api)")"
  local out
  out="$(docker run --rm --env-file "$1" "$image" node dist/scripts/check-mail.js 2>/dev/null || true)"
  out="${out##*mail-check: }"
  echo "${out:-unknown}"
}

restart_api() {
  "${COMPOSE[@]}" up -d --no-deps api >/dev/null
  for _ in $(seq 1 30); do
    if "${COMPOSE[@]}" exec -T api node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      echo "API دوباره راه‌اندازی شد و سالم است."
      return 0
    fi
    sleep 3
  done
  echo "API سالم نشد؛ برای بازگشت: cp <پشتیبان> $ENV_FILE && ${COMPOSE[*]} up -d --no-deps api" >&2
  return 1
}

backup_env() {
  mkdir -p "$BACKUP_DIR"
  local f
  f="$BACKUP_DIR/env-before-smtp-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$ENV_FILE" "$f"
  chmod 600 "$f"
  echo "پشتیبان تنظیمات قبلی: $f"
}

# Writes .env without SMTP_* lines plus the lines in $1 (may be empty), atomically.
write_env() {
  grep -v '^SMTP_' "$ENV_FILE" > "$tmp.env" || true
  [ -s "$1" ] && cat "$1" >> "$tmp.env"
  chmod 600 "$tmp.env"
  mv "$tmp.env" "$ENV_FILE"
}

case "${1:-}" in
  --check)
    { grep '^SMTP_' "$ENV_FILE" || true; } | sed "s/='\(.*\)'$/=\1/" > "$tmp"
    result="$(check "$tmp")"
    echo "نتیجه: $result — $(explain "$result")"
    [ "$result" = ready ]
    exit
    ;;
  --disable)
    backup_env
    : > "$tmp"
    write_env "$tmp"
    restart_api
    echo "ارسال ایمیل دعوت غیرفعال شد؛ لینک دعوت خصوصی همچنان در دسترس است."
    exit
    ;;
  "") ;;
  *) echo "گزینه نامعتبر: $1" >&2; exit 1 ;;
esac

read -rp "سرور SMTP [smtp.gmail.com]: " host; host="${host:-smtp.gmail.com}"
read -rp "پورت (465 = TLS مستقیم، 587 = STARTTLS) [465]: " port; port="${port:-465}"
read -rp "نشانی فرستنده (همان حساب ایمیل): " user
read -rsp "App Password (نمایش داده نمی‌شود): " pass; echo
pass="${pass// /}"
for v in "$host" "$port" "$user" "$pass"; do
  if [ -z "$v" ] || [[ "$v" == *"'"* ]] || [[ "$v" == *$'\n'* ]]; then
    echo "مقدار خالی یا نامعتبر؛ چیزی تغییر نکرد." >&2
    exit 1
  fi
done
[[ "$port" =~ ^[0-9]+$ ]] || { echo "پورت نامعتبر؛ چیزی تغییر نکرد." >&2; exit 1; }
secure=true; [ "$port" = 465 ] || secure=false

# Single quotes: Compose reads the values literally (no $ interpolation).
{
  echo "SMTP_HOST='$host'"
  echo "SMTP_PORT='$port'"
  echo "SMTP_SECURE='$secure'"
  echo "SMTP_USER='$user'"
  echo "SMTP_PASSWORD='$pass'"
  echo "SMTP_FROM='Manage by HEDAX <$user>'"
} > "$tmp"
unset pass

# docker --env-file takes values verbatim, so give it an unquoted copy.
sed "s/='\(.*\)'$/=\1/" "$tmp" > "$tmp.check"
result="$(check "$tmp.check")"
rm -f "$tmp.check"
echo "نتیجه بررسی از همین سرور: $result — $(explain "$result")"
if [ "$result" != ready ]; then
  echo "تنظیمات فعال نشد و فایل .env تغییری نکرد. لینک دعوت خصوصی همچنان در دسترس است."
  exit 2
fi
backup_env
write_env "$tmp"
restart_api
echo "ارسال ایمیل دعوت فعال شد. از بخش «کارکنان» با «بررسی اتصال ایمیل» دوباره بررسی کنید."
