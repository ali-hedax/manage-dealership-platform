## 2026-11-14 - PR #90 PIN gate fix installed successfully

- Supersedes the two stopped-rollout reports below. Continued from `1ad06595deafa3248b4f0cd0846914edec1d636d` on `docs/release-20261114c`, [PR #89](https://github.com/ali-hedax/manage-dealership-platform/pull/89). Read AGENTS, PROGRESS and product specification section 3; owner explicitly authorized laptop Git/SCP transport and only gate installation/recreation.
- Laptop fetch succeeded; `git merge-base --is-ancestor` verified MAIN_SHA **`2d77271c62489e171acca06e966e8994641e5def`** is in origin/main. Extracted `deploy/preview/gate.mjs` directly with binary `git show` output (8196 bytes), without PowerShell text conversion. SCP used the existing dedicated Manage SSH identity; no Git fetch ran on the server.
- Laptop candidate, transferred candidate and installed file SHA-256 all equal **`09e653793efb4a6ed89c9f27b89c6ab415b758cd58ba0f3a943a736e4db5a57a`**. Server candidate: `/home/manage/incoming/gate.mjs.candidate-FQNNXg-2d77271c`. Whitespace-tolerant `grep -Ec` PIN/TOTP array count **1**.
- The requested `node --check -` invocation failed because stdin was interpreted as CommonJS. Before any live change, the owner explicitly approved continuing after corrected ES module validation. `docker exec -i "$gate_id" node --input-type=module --check - < "$candidate"` passed with **exit 0** using the single running gate container (Node 22.23.4). Nothing installed on the host.
- Verified server user `manage`, canonical path `/opt/manage`, original live blob and preserved backup `8beef78f397fa6e873e96276276df9f86b13abec`; backup `/home/manage/incoming/gate.mjs.before-20261114` was not overwritten. Only live `deploy/preview/gate.mjs` changed; byte comparison passed; mode/owner/group preserved at **600 / 1000 / 1000**. Git branch/index were not changed; server remains detached at `1ba8d70` with only that working-tree file modified.
- Executed only `bash deploy/operational/operational-compose.sh up -d --no-build --pull never --no-deps --force-recreate --wait --wait-timeout 120 gate` from /opt/manage. New gate container **`68d6d05353519f780240b55c8f67a1e23f1edbf9af3c84bfb2c5e06bd6817916`**, actual StartedAt **2026-11-14T13:06:02.819377834Z**, health **healthy**. Logs since that StartedAt: **0 bytes, 0 error lines**.
- Post-install public GETs with no session/cookies and no redirect following: `/login` **200**; `/` **302**, Location `/login` on the same domain; `/api/v1/dashboard` **401**, JSON `error: LOGIN_REQUIRED`. Internal documented API health **200**, `status: ok`, `db: ok`, **commit: null**. No real or synthetic account login was performed; an authenticated staff journey was not tested.
- API container **`b0c19ef4dd8b2fe99d9f6981d2bc780b00001ace16ae9eaf0b3f7fc19d31c55a`**, image **`sha256:dab2a54296e51a6fcd9674ef4354995faa716b491d997fa639af00b357c6a909`**; web container **`ffd2bd564c93550ff4fe3e139fbb489c11c4d54a362de1157f4d7d53bf493cb8`**, image **`sha256:24e4d5eba52dbfe51635fe32f9beee3767d799362f26149ef70719476a514a1d`**: all IDs exactly unchanged before/after and both healthy.
- Application version independently verified as **`1ba8d708d939a0d2f36672e10143d48b5fcfc0ed`** by `/home/manage/incoming/deploy-20261114c/images/preview-image-source.txt` and both exact running image IDs in adjacent `preview-image-ids.txt`. Health's null commit was not altered or represented as a version confirmation.
- Rollback **not needed**. Failure-triggered backup restoration/recreation was prepared but never triggered. No Source, DNS, Caddy, firewall, .env, API/web images, migrations or account state changed.
- Staff audit completed at database UTC **2026-11-14T13:11:22.428305Z**, in one REPEATABLE READ **READ ONLY** transaction. Guarded exactly one non-test tenant and its single owner; explicitly joined staff queries to that tenant. Schema `is_active`, `pin_hash IS NULL`, role eligibility and `locked_until > CURRENT_TIMESTAMP` were checked without selecting credential values or personal fields. Query succeeded; no findings in either requested category. No account identifiers are stored in GitHub docs.
- Documentation validation: `node scripts/check-docs.mjs` passed (70 Markdown files, 176 API routes); `git diff --check` passed. PR remains open; CI must be checked on the new report SHA.
- Exact next step: owner/staff verify their normal PIN login in their own session. Preserve this gate backup and working-tree override during future deployments; the gate fix is pinned to the newer MAIN_SHA while API/web intentionally remain on 1ba8d70. CI result for this documentation update is reported separately; no merge authorized.

## 2026-11-14 - PR #90 resumed rollout: stopped at server GitHub fetch

- Continued from report commit `60179a7d2a43f88711d8470e777da9d2b2df7935` on `docs/release-20261114c` ([PR #89](https://github.com/ali-hedax/manage-dealership-platform/pull/89)). Read current AGENTS, PROGRESS and product specification section 3. Owner authorized Node validation in the existing gate container, only the pinned gate file, and only gate recreation.
- **Result: stopped before installation.** Server `git fetch origin main` exited **128** after **135056 ms**, unable to connect to GitHub port 443. Per the explicit stop-on-failure boundary, no candidate extraction, candidate `node --check`, candidate grep, target checkout or service recreation followed. Previous live grep count was 0; it was not rerun in this attempt. The host Node limitation has an authorized container-based solution, but this attempt did not reach that step.
- Final read-only baseline at **2026-11-14T13:01:32Z**: user `manage`, canonical checkout `/opt/manage`; worktree clean; live gate blob and preserved backup both `8beef78f397fa6e873e96276276df9f86b13abec`; `cmp` passed. Backup `/home/manage/incoming/gate.mjs.before-20261114` was not overwritten. Intended gate MAIN_SHA remains `2d77271c62489e171acca06e966e8994641e5def`.
- **Application provenance confirmed independently of health:** `/home/manage/incoming/deploy-20261114c/images/preview-image-source.txt` records `1ba8d708d939a0d2f36672e10143d48b5fcfc0ed`; adjacent `preview-image-ids.txt` exactly lists both running image IDs below. Both images also carry tags with that full SHA. OCI revision labels are absent. This is the existing CI artifact release evidence, not a health-reported commit.

| Service | Container ID (before = after) | Image ID (before = after) |
| --- | --- | --- |
| API | `b0c19ef4dd8b2fe99d9f6981d2bc780b00001ace16ae9eaf0b3f7fc19d31c55a` | `sha256:dab2a54296e51a6fcd9674ef4354995faa716b491d997fa639af00b357c6a909` |
| web | `ffd2bd564c93550ff4fe3e139fbb489c11c4d54a362de1157f4d7d53bf493cb8` | `sha256:24e4d5eba52dbfe51635fe32f9beee3767d799362f26149ef70719476a514a1d` |

- Gate remained `978924ac0a95a9700ae6d385e6486750a99d8ce75d7a6d4970a97595b73d918a`, **healthy**, StartedAt **2026-11-05T09:07:35.046952829Z**. API/web also stayed healthy. No restart occurred; no new-start log inspection applies. Historical logs were not read.
- Fresh sessionless/cookieless GETs without following redirects: `/login` **200**; `/` **302**, Location `/login`; `/api/v1/dashboard` **401**, JSON `error: LOGIN_REQUIRED`. Internal documented API health via existing gate container: **200**, `status: ok`, `db: ok`, **commit: null**. These remain baseline tests, not proof of PIN access after rollout.
- Rollback **not needed**: live file, containers and images stayed unchanged. No account report ran (installation success is its prerequisite): active staff without PIN **not checked**; locked staff **not checked**. No account login, creation, PIN/hash/password/name/email/phone read, or mutation. No Source, DNS, Caddy, firewall, .env, API/web image or migration changes.
- Documentation checks: `node scripts/check-docs.mjs` passed (70 Markdown files, 176 API routes), and `git diff --check` passed. CI for the new report must be checked after push.
- **Exact next step:** once server-to-GitHub connectivity is available, rerun the authorized fetch with a bounded timeout; preserve and verify the same backup; validate a temporary pinned candidate using `docker exec -i "$gate_id" node --check - < "$candidate"` and grep count 1; recheck artifact/image correspondence; install only gate and complete the requested checks and tenant-scoped READ ONLY staff report. No connection configuration changes were attempted.

## 2026-11-14 - PR #90 gate rollout stopped before installation

- Owner authorized only the gate file from MAIN_SHA `2d77271c62489e171acca06e966e8994641e5def`, for release reporting in [PR #89](https://github.com/ali-hedax/manage-dealership-platform/pull/89). Documentation branch began at `74a1ee01c0998995ec8ea276a2e68ff7817d373b`.
- Read-only checks at **2026-11-14T12:54:32Z** confirmed SSH user `manage`, canonical checkout `/opt/manage`, HEAD `1ba8d708d939a0d2f36672e10143d48b5fcfc0ed`, clean worktree, and gate file equal to HEAD (blob `8beef78f397fa6e873e96276276df9f86b13abec`).
- Created previously absent backup `/home/manage/incoming/gate.mjs.before-20261114` without overwrite; `cmp` passed. Fetched origin/main and verified the target gate blob exists. No checkout of the target file occurred.
- **Stop condition:** `command -v node` exited 1: Node is unavailable on the host. Per the owner's stop-on-failure instruction, installation stopped before changing the live file. Target `node --check` was **not run**; the existing live gate's PIN/TOTP-array `grep -Ec` count is **0**. It does not contain the fix.
- Existing gate: **healthy**, StartedAt **2026-11-05T09:07:35.046952829Z**. API, web and DB also healthy. Gate was not recreated; no new-start logs exist to inspect, and historical logs were not inspected. No build, image pull, migration, API/web restart, connection/DNS/Caddy/firewall changes, or credential reads.
- Pre-install HTTPS GETs, no session/cookies and no redirects followed: `/login` **200**; `/` **302**, Location `/login`; `/api/v1/dashboard` **401**, JSON `error: LOGIN_REQUIRED`. These are baseline checks, not evidence of a successful PIN rollout.
- Public `/api/v1/health` is gated (**401**). Internal documented `/api/v1/health`, fetched using existing gate container Node: **200**, `status: ok`, `db: ok`, **commit: null**. Expected `1ba8d70` prefix could not be verified from health; Git HEAD matches it but is a different source of evidence.
- Rollback: not required; live file remains byte-identical to its backup and no service was recreated. Active staff without PIN and currently locked staff: **not checked**, because account reporting was conditional on successful installation/validation. No login or account mutation occurred.
- Reporting limitations: initial local sandbox Git/network access failed; authorized elevated fetch/PR read succeeded. Two read-only SSH reporting scripts printed their results then exited nonzero because PowerShell appended CR to the final here-document/command; a repeat independently confirmed dashboard LOGIN_REQUIRED and internal health. No writes occurred in these probes.
- Documentation validation: `node scripts/check-docs.mjs` passed (70 Markdown files, 176 API routes); `git diff --check` passed. The first sandboxed validator attempt failed with Git subprocess EPERM; elevated validation passed.
- Exact next step: resume only after addressing the stop condition in the rollout procedure: use the existing Node 22 gate container for syntax validation (no host installation), then install only the pinned gate file, recreate only gate, perform all checks and the scoped READ ONLY account report. Resolve health's null commit explicitly. Backup above must be verified and reused, never overwritten.

# Deployment

**Production domain (2026-11-05):** production answers at `https://managebyhedax.ir` through the ArvanCloud proxy. The origin certificate expires **2027-02-03 08:08:19 UTC** and nothing renews it. See [Production domain and certificate](#production-domain-and-certificate).

**Latest release (2026-11-07, 16:34 Tehran):** the owner approved smart planning suggestions `813fcc4` (PR #63). It was installed with the exact images from CI run 42364994572.
- No migration; the database still has 19 migrations. `.env` was unchanged.
- The switch took about 9 seconds.
- Pre-install backup `operational/20261107T130255Z` and final backup `operational/20261107T130547Z` were both restored separately and matched live. An encrypted off-server copy was saved.
- The previous images (`5cf9c72`) are kept under the rollback tag `rollback-smart-20261107`.
- See the [release record](RELEASE_SMART_20261107.md).

**Earlier release (2026-11-07, 11:20 Tehran):** the owner approved technician unit and bay `5cf9c72` (PR #60). It was installed with the exact images from CI run 42351838139.
- No migration; the database still has 19 migrations. `.env` was unchanged.
- The switch took about 9 seconds.
- Pre-install backup `operational/20261107T074828Z` and final backup `operational/20261107T075121Z` were both restored separately and matched live. An encrypted off-server copy was saved.
- The previous images (`ee86d5c`) are kept under the rollback tag `rollback-bay-20261107`.
- See the [release record](RELEASE_BAY_20261107.md).

**Earlier release (2026-11-07, 10:29 Tehran):** the owner approved the staff page redesign `ee86d5c` (PR #58). It was installed with the exact images from CI run 42347592707.
- No migration; the database still has 19 migrations. `.env` was unchanged.
- The switch took about 8 seconds.
- Pre-install backup `operational/20261107T065755Z` and final backup `operational/20261107T070041Z` were both restored separately and matched live. An encrypted off-server copy was saved.
- The previous images (`be3dd66`) are kept under the rollback tag `rollback-staff-20261107`.
- See the [release record](RELEASE_STAFF_20261107.md).

**Earlier release (2026-11-07, morning):** the owner approved integrated main `be3dd66`, which contains phases 1–3, the new look and staff access recovery. It was installed with the exact images from CI run 42206001421.
- Migrations `0016`–`0018` were rehearsed on a restored backup and then applied, with all 42 existing tables proven unchanged. The database now has 19 migrations.
- The switch took 43 seconds. `.env` was unchanged.
- Final backup `operational/20261107T053603Z` was restored and verified. An encrypted off-server copy was saved.
- See the [release record](RELEASE_INTEGRATION_20261107.md).
- Rollback images: tag `pre-integration-20261107` on both `manage-api` and `manage-web`.

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
| 2026-11-14 | Manage Production | 1ba8d70 (PR #88, includes #87) | Owner-approved urgent release | No new migration (24 retained) | Healthy. Main CI run 43575370737 6/6; exact CI images (api `dab2a54296e5`, web `24e4d5eba52d`). Rehearsal backup `20261114T084941Z` restored, 53 table fingerprints equal, new images healthy on the scratch DB. API/web stopped 08:51:27 UTC, final backup `20261114T085127Z`, live 08:52:02, verified 08:52:04; rollback armed, not needed. Synthetic `TECH 99` login returns `INVALID_CREDENTIALS` (was `DEVICE_NOT_REGISTERED`). Health still has `commit: null`; version identified by image IDs. Afterwards the owner-approved technician username plan was applied (11 accounts). [Test report](TEST_REPORT.md) |
| 2026-11-14 | Manage Production | a170340 (PR #85) | Owner-approved release | No new migration (24 retained) | Healthy. Main CI run 43567383358 6/6; exact CI images (api `b74d7c49a636`, web `02101660523d`). Rehearsal backup `20261114T072706Z` restored, 53 table fingerprints equal, new images healthy on the scratch DB. API/web stopped 07:28:57 UTC, final backup `20261114T072857Z`, live 07:29:31, verified 07:29:33; rollback armed, not needed. Health has `commit: null` (no `GIT_COMMIT` in image or `.env`); version identified by running image IDs = artifact IDs. [Test report](TEST_REPORT.md) |
| 2026-11-12 | Manage Production | 9e14c91 | Owner-approved release | 0023 (24 total) | Healthy. Exact CI images; rehearsed on restored backup `20261112T102233Z`; final backup `20261112T112137Z`. [Test report](TEST_REPORT.md) |
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
