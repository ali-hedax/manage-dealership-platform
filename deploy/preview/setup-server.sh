#!/usr/bin/env bash
# One-time setup of a fresh, dedicated Ubuntu 24.04 VM for the Manage Preview.
# Run as root on the new VM only — never on a server shared with another
# product (Source by HEDAX in particular).
#
#   PREVIEW_HOST=<host name> bash setup-server.sh
#
# Does: updates and automatic security updates, 2 GB swap, firewall (SSH, 80,
# 443 only), key-only SSH, Docker from the Ubuntu archive with the ArvanCloud
# registry mirror, a `manage` user, the repository in /opt/manage, and
# generated secrets in /opt/manage/.env (mode 600). Prints the site password
# once; it is not stored in clear text anywhere.
set -euo pipefail

: "${PREVIEW_HOST:?set PREVIEW_HOST (e.g. 185-1-2-3.sslip.io or preview.example.ir)}"
REPO_URL="${REPO_URL:-https://github.com/ali-hedax/manage-dealership-platform.git}"
REPO_REF="${REPO_REF:-feature/preview-deploy}"
DOCKER_MIRROR="${DOCKER_MIRROR:-https://docker.arvancloud.ir}"
APP_DIR=/opt/manage
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -q
apt-get -yq upgrade
apt-get -yq install ca-certificates curl git ufw unattended-upgrades fail2ban docker.io docker-compose-v2
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== swap (image builds need more than 4 GB at peak)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== firewall: SSH, HTTP, HTTPS only"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== SSH: keys only"
install -d -m 755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-manage-preview.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl reload ssh || systemctl reload sshd

echo "== docker"
install -d /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["${DOCKER_MIRROR}"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl enable --now docker
systemctl restart docker

echo "== user and repository"
id manage >/dev/null 2>&1 || useradd -m -s /bin/bash -G docker manage
install -d -m 700 -o manage -g manage /home/manage/.ssh
if [ -f /root/.ssh/authorized_keys ]; then
  install -m 600 -o manage -g manage /root/.ssh/authorized_keys /home/manage/.ssh/authorized_keys
fi
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --quiet "$REPO_URL" "$APP_DIR"
fi
git -C "$APP_DIR" fetch --quiet origin "$REPO_REF"
git -C "$APP_DIR" checkout --quiet "$REPO_REF"
chown -R manage:manage "$APP_DIR"

echo "== secrets"
if [ ! -f "$APP_DIR/.env" ]; then
  # cut reads its whole input: no SIGPIPE under pipefail.
  rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c "1-$1"; }
  SITE_PASSWORD="$(rand 20)"
  DEMO_PASSWORD="$(rand 16)"
  umask 077
  cat > "$APP_DIR/.env" <<EOF
APP_ENV=preview
PREVIEW_HOST=${PREVIEW_HOST}
POSTGRES_PASSWORD=$(rand 32)
SEED_DEMO_PASSWORD=${DEMO_PASSWORD}
NODE_ID=preview-arvan
EOF
  HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$SITE_PASSWORD")"
  printf 'basic_auth {\n\tpreview %s\n}\n' "$HASH" > "$APP_DIR/deploy/preview/auth.caddy"
  chown manage:manage "$APP_DIR/.env" "$APP_DIR/deploy/preview/auth.caddy"
  chmod 600 "$APP_DIR/.env"
  chmod 644 "$APP_DIR/deploy/preview/auth.caddy"
  echo
  echo "Site gate      user: preview   password: ${SITE_PASSWORD}"
  echo "Demo accounts  password (all): ${DEMO_PASSWORD}"
  echo "Keep both in a password manager; they are not shown again."
fi

echo "== done. Next: sudo -u manage bash $APP_DIR/deploy/preview/deploy.sh"
