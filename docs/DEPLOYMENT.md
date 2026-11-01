# Deployment

**Current state:** runs locally (`pnpm dev`) and as a Docker Compose stack. No Preview, staging or production host is provisioned yet. Arvan Cloud access for Manage has not been granted to the agent, and the final domain is not chosen. **Nothing in this repository changes DNS, firewalls or production automatically.**

## Isolation from Source by HEDAX

Manage must not share the Source by HEDAX server's processes, database, credentials, deploy keys or domain configuration. If an existing Arvan server must be reused for cost, first measure free CPU/RAM/disk, then run Manage as a separate Compose project (own network, own PostgreSQL volume, own reverse-proxy site, own secrets) and document the capacity check. Preferred: a separate small VM.

## Environments

| | Development | CI | Preview / Staging | Production (cloud) | Dealership LAN |
| --- | --- | --- | --- | --- | --- |
| How | `pnpm dev` | GitHub Actions | Compose on an isolated VM | Compose on an isolated VM | Compose on the local server |
| DB | PGlite | PGlite + PostgreSQL 16 | PostgreSQL | PostgreSQL | PostgreSQL |
| Data | synthetic | synthetic | synthetic (auto-seeded) | real | real |
| `APP_ENV` | development | test | preview | production | production |
| Approval | — | — | owner OK for host | **owner approval per release** | **owner + IT approval** |

## Docker Compose

```bash
cp .env.example .env
# set POSTGRES_PASSWORD (long random), SEED_DEMO_PASSWORD (preview only), APP_ENV
docker compose up -d --build
docker compose ps        # db, api, web healthy
```

- `api` is not published; only `web` is (port `WEB_PORT`). The web container proxies `/api/v1` to `http://api:4000`.
- Preview: `APP_ENV=preview` migrates automatically and seeds the synthetic dealership into an empty database.
- Production: `APP_ENV=production` refuses PGlite and does **not** migrate on start. Run migrations as an explicit step after a backup:

```bash
docker compose run --rm api node dist/scripts/migrate.js
```

## TLS and reverse proxy

Put Caddy or Nginx in front of `web` with HTTPS, set `COOKIE_SECURE=true`, and forward `X-Forwarded-For` (rate limiting is per client IP). Example Caddyfile once the domain is approved:

```
manage.<approved-domain> {
    reverse_proxy web:3000
}
```

On the LAN without a public domain: an internal CA certificate or a reverse proxy with a locally trusted certificate (decide with IT; see [IT_SERVER_CHECKLIST_FA.md](IT_SERVER_CHECKLIST_FA.md)).

## Production checklist (each release)

1. Owner approval recorded (issue/PR) with the commit SHA to deploy.
2. CI green on that commit (check, postgres, e2e, security).
3. Backup taken and its restore verified on a scratch database ([BACKUP_RESTORE.md](BACKUP_RESTORE.md)).
4. `docker compose build` → `migrate` → `up -d`.
5. Health: `GET /api/v1/health` returns `status: ok`, `db: ok`, expected `commit` (set `GIT_COMMIT` build arg/env).
6. Smoke test: login, open dashboard, open one case.
7. Record in the deployment log below: date, SHA, operator, migrations applied, result.
8. Rollback: `docker compose` back to the previous image tag; if a migration ran, restore the pre-deploy backup (down scripts in `apps/api/src/db/down` only for disposable data).

## Deployment log

| Date | Environment | Commit | Operator | Migrations | Result |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | No deployment yet |
