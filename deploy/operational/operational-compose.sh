#!/usr/bin/env bash
set -euo pipefail
cd /opt/manage
exec docker compose -f docker-compose.yml -f deploy/preview/docker-compose.preview.yml -f deploy/preview/docker-compose.form-gate.yml -f /home/manage/operations/operational.yml "$@"
