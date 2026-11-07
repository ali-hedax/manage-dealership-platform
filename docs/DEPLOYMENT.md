# Deployment

**Production domain (2026-11-05):** production answers at `https://managebyhedax.ir` through the ArvanCloud proxy. The origin certificate expires **2027-02-03 08:08:19 UTC** and nothing renews it. See [Production domain and certificate](#production-domain-and-certificate).

**Latest release (2026-11-07):** the owner approved integrated main `be3dd66`, which contains phases 1–3, the new look and staff access recovery. It was installed with the exact images from CI run 42206001421.
- Migrations `0016`–`0018` were rehearsed on a restored backup and then applied, with all 42 existing tables proven unchanged. The database now has 19 migrations.
- The switch took 43 seconds. `.env` was unchanged.
- Final backup `operational/20261107T053603Z` was restored and verified. An encrypted off-server copy was saved.
- See the [release record](RELEASE_INTEGRATION_20261107.md).
- Rollback images: `manage-api:pre-integration-20261107` and `manage-web:pre-integration-20261107`.

**Previous release (2026-11-05):** owner-authorized entry/workbench `ad54f15` is installed with exact verified CI images, restored backups, preserved data/auth/access and no new migration/seed. Forty-second switch. Final backup `operational/20261105T054714Z`, encrypted off-server recovery verified. Direct Google holiday fetch currently times out on the host; the local Iran ICS-file path is available. See [release evidence](RELEASE_ENTRY_20261105.md). Earlier deployment entries below are history.

**Current state:** the dedicated Manage host is Production with real data. Owner-approved online mobile installation and complete support desk `9e82246` were installed on 2026-11-04 using tested CI images, verified restores and the operational wrapper; no new production migration or seed was needed. See the [current release record](RELEASE_PWA_20261104.md) and [real-start boundary](REAL_START_FA.md). The Preview instructions below are historical; do not run its reset/deploy script on Production. Source and DNS remain unchanged.

## Local Preview (available now)

Local Preview is an alternative to the hosted personal-authentication Preview; it uses a separate synthetic database and demo login:

```bash
pnpm install
pnpm preview            # builds if needed, then http://localhost:3100
pnpm preview --reset    # fresh synthetic demo data
pnpm preview --lan      # also reachable from phones on the same network
```

- Production build with `APP_ENV=preview`, embedded PostgreSQL (PGlite) persisted in `apps/api/.data/preview/`, synthetic demo dealership seeded into an empty database.
- One password for all demo accounts, generated once and kept in `apps/api/.data/preview/credentials.local.txt` (git-ignored).
- Ports 3100 (web) and 4100 (API) so a running `pnpm dev` (3000/4000) is not disturbed; override with `PREVIEW_WEB_PORT` / `PREVIEW_API_PORT`.
- `--lan` listens on all interfaces; Windows may ask to allow Node.js through the firewall. That is the owner's decision; by default the Preview listens on localhost only.
- Nothing is published to the internet. A public link needs either an isolated host (#5) or an approved tunnel service — both are owner decisions.

## Preview on an isolated ArvanCloud VM (already deployed)

Historical provisioning plan, resources and approval points: [PREVIEW_ARVAN_FA.md](PREVIEW_ARVAN_FA.md). Files: `deploy/preview/`.

```bash
# on the new VM, as root (once)
PREVIEW_HOST=<host> bash setup-server.sh        # firewall, key-only SSH, Docker + Arvan mirror, secrets
# then, as the manage user (every update)
bash /opt/manage/deploy/preview/deploy.sh <git-ref>
```

- Caddy is the only published service (80/443): automatic HTTPS, a site-wide password gate (bcrypt hash generated on the server, never committed), `X-Robots-Tag: noindex`, real client address passed on (`TRUST_PROXY_HEADERS=true`).
- API and PostgreSQL are internal; the API runs migrations and seeds the synthetic dealership on an empty database.
- CI runs the same overlay on every PR (HTTPS via Caddy's internal CA for `localhost`, 401 without the gate password, login, Secure cookie, web port not published) and shellchecks the scripts.

## Isolation from Source by HEDAX

Manage must not share the Source by HEDAX server's processes, database, credentials, deploy keys or domain configuration. If an existing Arvan server must be reused for cost, first measure free CPU/RAM/disk, then run Manage as a separate Compose project (own network, own PostgreSQL volume, own reverse-proxy site, own secrets) and document the capacity check. Preferred: a separate small VM.

## Environments

| | Development | CI | Preview / Staging | Production (cloud) | Dealership LAN |
| --- | --- | --- | --- | --- | --- |
| 2026-11-05 | Manage Production | 696eb6f | Owner-requested publication | No new migration (15 retained) | Exact CI images, restored backups and live concise model/owner list verified; full data/auth/settings preserved; 35-second final switch. [Record](RELEASE_SHORT_LABEL_20261105.md) |
| 2026-11-04 | Manage Production | d0a66b2 | Owner-approved release | No new migration (15 retained) | Exact CI images; all data/auth/settings preserved, final restored/encrypted recovery and live compact UI verified; 39-second switch. [Record](RELEASE_ASSESSMENT_20261104.md) |
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

## Production domain and certificate

Traffic path: visitor → ArvanCloud proxy (Arvan-managed certificate, renewed by Arvan) → HTTPS → Caddy on the VM → gate → web → API. Caddy stays the web server (no nginx or certbot on the host).

`deploy/operational/Caddyfile.production` answers 301 to `https://managebyhedax.ir` for HTTP, `www`, the raw IP and the former sslip.io name, and proxies the canonical name to the gate. An anonymous request to `/` answers 302 to `/login` by design; `/login` answers 200.

**Client address.** Caddy trusts only Arvan's [official ranges](https://www.arvancloud.ir/fa/ips.txt), reads `X-Forwarded-For` right to left, and sends the API one verified value. The API uses the right-most value (`trust proxy` = 1) and the web server passes it on (`TRUST_PROXY_HEADERS=true`), so login limits, sessions and audit rows see the visitor. **If Arvan adds a range and it is not listed, visitors behind it share an Arvan address and share one login limit.** Compare the list with the Caddyfile periodically.

**Origin certificate.** A static Let's Encrypt pair in `/home/manage/operations/tls/`, used only between Arvan and the VM, expires **2027-02-03 08:08:19 UTC**. By owner decision no renewal runs anywhere. Whether Arvan refuses an expired origin certificate depends on its origin settings and has not been tested. Decide a replacement before that date. The VM has no international connectivity in either direction (measured 2026-11-05), so certbot cannot run there. `deploy/operational/renew-certificate.mjs` remains available to run by hand from a workstation with DNS-01; the private key is generated on the VM and stays there. It reloads Caddy itself. The private key is also inside the private `operations.tgz` of each operational backup.

Direct requests to the VM bypass Arvan and are not blocked, but cannot forge an address: the peer is untrusted, so its own address is used. The former sslip.io certificate cannot renew; HTTPS on that name stops at its expiry on 2027-01-30, and its HTTP redirect continues.

Rollback data: `/home/manage/backups/domain-switch-20261105T090723Z` and `/home/manage/backups/arvan-proxy-20261105T092134Z`.

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
| 2026-11-07 | Manage Production | be3dd66 | Owner-approved release | 0016, 0017, 0018 (19 total) | Healthy. Exact CI images; rehearsed on a restored backup, all existing rows preserved; 43-second switch; final restore and encrypted recovery verified. [Record](RELEASE_INTEGRATION_20261107.md) |
| 2026-11-05 | Manage Production | 79f6585 | Owner-approved release | 0015 (16 total) | Healthy. Exact CI images; 46-second switch. [Record](RELEASE_DISPATCH_DAYS_20261105.md) |
| 2026-11-04 | Manage Production | 9e82246 | Owner-approved release | No new migration (15 retained) | Healthy; source/image IDs, environment/data preservation, restored final backup and owner browser checked. [Record](RELEASE_PWA_20261104.md) |
| 2026-11-04 | Manage Production | 880b121 | Owner-approved release | 0014 (15 total) | Healthy; source/image IDs, restored backups, preserved auth/data and owner browser verified. [Record](RELEASE_ACCIDENT_20261104.md) |
| 2026-11-01 | Isolated Preview | 58ad08c | Previous approved rollout | Through 0005_personal_auth | Healthy; owner later confirmed personal login. [Full record](PREVIEW_DEPLOYMENT_20261101.md) |


## In-app browser compatible Preview gate

The live VM also uses deploy/preview/docker-compose.form-gate.yml after the original Preview overlay. Setup creates its hashed-password/session-key configuration and deploy.sh selects it when configured. See the browser follow-up in PREVIEW_DEPLOYMENT_20261101.md. Keep all three Compose files when operating this VM.

## Current authentication and safe update boundary

Personal mode supersedes the legacy shared gate described above: TOTP_AUTH_ENABLED=true on API and gate, HTTPS PUBLIC_APP_URL and a persistent AUTH_TOKEN_SECRET are required. The login page is public; private routes require a TOTP-verified session. Follow [personal-auth settings](PERSONAL_AUTH_FA.md). Local default demo mode is different.

This audit only read the Manage VM Git/container state: deployed 58ad08c, clean worktree, healthy services. No deployment was performed. Historical setup commands are not instructions to provision again.

Before any future owner-approved update, inspect all tracked/untracked changes, preserve them privately and take DB/config backups. The existing deploy.sh uses reset --hard and image prune; do not run it on an unreviewed checkout or as an automatic update. Review and harden that behavior in a separate tested change before relying on it. All three Compose files remain necessary on this VM. Do not publish .env, invitation files or backup contents.

## Staff invitation email configuration

New feature branch: feature/staff-email-invitations. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD and SMTP_FROM privately on the Manage Preview only; Compose passes them to API only. Gmail requires a user-created App Password; neither the primary Google password nor a six-digit code can be used. Keep AUTH_TOKEN_SECRET unchanged. Verify SMTP authentication without sending mail, then exercise an owner-authorized invitation recipient. Back up DB/config before additive migration 0006. Current mail configuration being present is distinct from successful provider authentication and actual email delivery. Do not claim rollout complete until the feature is deployed, services healthy and the sender verified.
