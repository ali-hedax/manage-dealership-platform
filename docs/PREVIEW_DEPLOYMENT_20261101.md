# Isolated Preview deployment — 2026-11-01

Owner approved the dedicated paid VM and the temporary hostname in the current chat. Source by HEDAX and Production were not accessed or changed. No owner-managed DNS record was changed; no branch was merged.

- URL: https://manage-85-198-52-255.sslip.io/login
- VM: `manage-preview`, ArvanCloud Qeysar, `85.198.52.255`, 2 vCPU, 4 GB RAM, 50 GB SSD, Ubuntu 24.04.4 LTS.
- Application code: `dfd5166a9269708fa0943bb33620bbda54d749a7`, `feature/preview-deploy`, draft PR #19. Five latest CI jobs passed for that application commit.
- Panel quote at creation: 936,480 IRR/day (93,648 toman/day), 28,094,400 IRR per 30 days, before unverified ancillary charges/tax. The panel warned that deletion is unavailable for the first 48 hours. This is not a fixed monthly invoice.

## Security and runtime

Only SSH and Caddy's HTTP/HTTPS ports are public. PostgreSQL, API and web have no host-published ports. SSH password and keyboard-interactive authentication are disabled; root permits keys only. The dedicated `manage` user can deploy through Docker. Source's SSH key was not used.

UFW, fail2ban's SSH jail, unattended upgrades, Docker restart policies, bounded container logs, and 2 GB swap are enabled. Caddy obtained a publicly trusted Let's Encrypt certificate and provides a site-wide password gate. Application sessions use Secure/HttpOnly cookies and the authenticated site returns `noindex`.

`.env` is mode 600, owned by `manage`. Credentials are delivered privately to the owner; the server copy is `/root/manage-preview-credentials.txt`, mode 600. Do not paste credentials, hashes or session cookies into GitHub.

## Verification actually run

- Both images built on this VM; Compose reports API, web and database healthy.
- HTTPS certificate validation passed without bypassing TLS verification.
- Anonymous `/login`: 401. Authenticated gate `/login`: 200 and `X-Robots-Tag: noindex`.
- Health: `status=ok`, `db=ok`, `dbDriver=postgres`, `environment=preview`.
- Manager login succeeded; its session cookie is Secure and HttpOnly.
- Authenticated dashboard returned 5 synthetic active cases.
- TCP ports 3000, 4000 and 5432 were unreachable from the owner's computer.
- Fresh SSH login as `manage` succeeded; effective `sshd -T` settings were checked.
- Setup script passed `bash -n` and ShellCheck after the fixes below.

The current health endpoint reports `commit=null`; the deployed application SHA above was verified against `/opt/manage` and the image build source. Browser E2E tests were not rerun against this host; the deployment verification exercised HTTP/API login and dashboard, and the existing application commit's Playwright CI passed.

## Installation fixes

Arvan's `01-arvan-root-login.conf` takes precedence over `10-...`, so the dedicated hardening file now sorts first (`00-manage-preview.conf`). Validate SSH configuration and explicitly enable/start the service before reloading (socket-activated images otherwise fail). Install the Docker Buildx plugin explicitly. Set a normal umask before cloning so a restrictive parent shell cannot produce unreadable non-root container files; use umask 077 only for credentials. Store new credentials in the root-only file rather than writing them to command logs.

During this deployment, an inherited restrictive umask initially made application files unreadable. Tracked application files/directories were made readable/traversable, secrets remained mode 600, and both images were rebuilt successfully. No database was reset to recover from this failure.

## Next steps

Owner tests the Preview with synthetic data. Final domain/DNS and any production release remain separate decisions. Keep the draft PR chain unmerged until explicitly approved. Subsequent updates should record the exact deployed SHA and repeat the gate, login, health and dashboard checks; never use Source's resources or credentials.

## Browser compatibility follow-up — 2026-11-01

The in-app browser rejected the native Basic authentication challenge with ERR_INVALID_AUTH_CREDENTIALS. The Preview now uses the additional `docker-compose.form-gate.yml` overlay: Caddy proxies through an internal, non-root Node gate. Unauthenticated page requests redirect to a Persian HTML sign-in form; API requests receive 401 without a browser challenge. The same existing Preview password is retained, stored as a salted scrypt digest. Successful sign-in sets a signed, expiring, Secure/HttpOnly/SameSite=Strict host-only cookie. The gate checks login Origin, limits attempts and request size, and does not publish an additional host port. The old Basic header remains supported for smoke-test clients without a WWW-Authenticate challenge.

`setup-server.sh` configures form-gate secrets without printing them. `deploy.sh` includes the form overlay when PREVIEW_GATE_HASH exists in `.env`. Always include all three Compose files on this VM; using only the original two would restore the legacy browser challenge. No password, domain, DNS or production resource changed.

Verification: Node integration tests passed locally and in the Node 22 container (valid/invalid login, Origin rejection, rate limiting, Secure/HttpOnly cookie, tampered/expired token rejection and upstream credential stripping); shell syntax and ShellCheck passed. The actual in-app browser completed both login steps and displayed the manager dashboard with five synthetic cases. Screenshot evidence and access details were delivered privately to the owner. Earlier statements about anonymous `/login` returning 401 and no host browser test are superseded by this follow-up: anonymous pages now redirect, and in-app browser login was verified.
## Update — QC and delivery (issue #12), 2026-11-01

Owner approved merging the tested changes into the Preview branch only (not `main`). `feature/qc-delivery` (draft PR #20) was merged into `feature/preview-deploy` as merge commit `88e1f6d`; doc conflicts were resolved by keeping both sides.

Before the merge: CI green on #19 and #20 (5/5 each). On the merged tree locally: lint, typecheck, shared 9/9, API 56/56, gate test, build, E2E 8/8. CI on the merged branch: 5/5 green (run 41295600434, incl. the Preview overlay with the form gate).

Deployment on the same VM (no new resources, no DNS, password or firewall change):

- Database backup before the migration: `/home/manage/backups/preview-before-qc-20261101T100432Z.sql.gz` (mode 600, owner `manage`). The database then held only the seeded synthetic data; the only later activity was manager logins.
- `deploy.sh feature/preview-deploy` with all three Compose files (form gate kept). Both images rebuilt on the VM; API, web, database and gate healthy; only 80/443 published by Caddy. Deployed SHA `88e1f6d` verified in `/opt/manage`. Migrations 0000–0004 applied (`qc_inspections` present).
- Synthetic demo data recreated with `reset-demo.js` (same demo password from `.env`), so demo case 5 shows the QC rounds and technical close.

Verification actually run, over public HTTPS through the form gate (secrets read from the root-only file into the test process, never printed): 49/49 checks passed —

- Gate: anonymous page → gate form (302), anonymous API 401, Persian form, wrong password refused, gate cookie Secure/HttpOnly; health `ok`, `postgres`, `preview`.
- Logins for manager, expert, supervisor, parts, cashier, QC (session cookies Secure/HttpOnly); system admin cannot read cases.
- Dashboard (5 active cases); each of the five demo cases opens with detail, assessment, parts, finance, QC/delivery state and history; phone masked for the parts clerk; case 5 has two QC rounds (failed/passed), valid technical close, open financial close.
- Full flow on a new synthetic case: create and find by VIN → assessment, finalize, customer authorization → purchase blocked by the finance gate → advance (expert cannot approve; manager approves; cashier confirms) → order, receipt, handover of the part → activity approved → QC fail with corrective activity → QC pass → technical close → financial close refused while the balance is due → settlement payment → financial close → handover → delivered and archived; history contains every step.
- Afterwards the demo data was recreated again, so the owner starts with exactly the five demo cases.
- Real browser (Edge, desktop 1366×860 and phone 412×915): gate form → Manage login → dashboard (no horizontal scroll) → demo case 5 completion panel. Screenshots kept privately (not committed; they show the live host).

## Personal login follow-up — 2026-11-01

Preview now runs `58ad08c9ccb427de74ce2d2c2f008a29e043b972` from draft PR #21, retaining QC and hand-over. All five CI jobs passed (run 41297169933). Additive migration 0005 follows QC migration 0004. Private pre-deploy DB/config backup and post-invitation backup exist on the Manage VM; the persistent authentication encryption key stays private and must be preserved with DB backups.

Personal mode uses email + a user-chosen password + Google Authenticator. It replaces shared/demo access on this Preview. No SMTP or Gmail setup is used. HTTP checks confirmed public login 200, unauthenticated private routes denied/redirected, legacy password login 403, API/gate/web/db health and NTP. Owner invitation was saved privately and the empty activation form opened in the in-app browser. Owner password, QR enrollment and first personal login are still pending the owner's actions; do not report them as completed. Source, Production and owner DNS remain unchanged. For next steps see PROGRESS and PERSONAL_AUTH_FA.

## Repository reconciliation follow-up — 2026-11-01

Owner reports completing their own personal-password/Authenticator setup and entering Preview. Earlier pending-owner statements are historical. The audit did not inspect their credentials/session or perform a new rollout. Read-only SSH inspection confirmed /opt/manage at 58ad08c9ccb427de74ce2d2c2f008a29e043b972 with no tracked/untracked changes and healthy application containers. That SHA is already in GitHub; later 82152c2 is documentation only.

## Update — PR #28 (invitation email diagnostics), 2026-11-02

Owner approved installing PR #28 on the Manage Preview only, from CI-built images, with a restorable backup first. Done; nothing was deleted.

- **Images:** built by CI on draft PR #29 (PR #28 plus only the image-export CI step of PR #25). The source merge commit `58391f1` differs from PR #28 head `e042d9f` only in `.github/workflows/ci.yml`. All 6 CI jobs green (run 41398302563). Archive SHA-256 verified locally and on the VM; loaded image IDs match the CI manifest. The VM cannot reach npm or the artifact storage, so the archive was copied from the owner's machine in verified 5 MB chunks.
- **Backup** `/home/manage/backups/pr28-20261102T065529Z` (mode 700/600): `pg_dump -Fc` (188 entries), `.env`, `deploy/preview` config, previous git head and image IDs, counts, SHA256SUMS, and the update/rollback script. Restorability was tested by restoring into a temporary database on the same server (users 8, Authenticator 1, cases 5, audit 85, migrations 7 — identical); the temporary database was dropped. Previous images are tagged `manage-api|manage-web:before-pr28-20261102T065529Z`.
- **Install:** only the API and web containers were recreated (`--no-deps --no-build`). Caddy, the gate, the database and `.env` were untouched (`.env` byte-identical). The checkout is clean at `e042d9f`.
- **Verification:**
  - All five services are healthy; health reports `ok/postgres/preview`.
  - Migration 0007 applied (8 migrations) and the `invitation_failure` column exists.
  - Users, active accounts, enrolled Authenticators, cases, tasks, parts, audit and invitations have the same counts before and after.
  - Over public HTTPS: certificate valid until 2027-01-30. Anonymous `/` and `/users` redirect to `/login`; `/login`, `/activate` and `/reset-password` return 200; `totpEnabled: true`.
  - Anonymous staff list, mail check and private-invite API calls return 401. Demo shared-password logins return 403 (personal sign-in only), so the authenticated staff page can only be exercised by the owner.
- **Network observation:** the app answers in about 0.1 s, but new TCP connections to the public address sometimes take 5–15 s. This happens from the owner's machine and from the VM to its own public IP, and SSH connections time out intermittently. UFW, conntrack (52/65,536) and fail2ban show no cause on the VM; the delays are upstream (datacenter or national network). Nothing was changed.
- **Rollback:** `bash /home/manage/backups/pr28-20261102T065529Z/deploy-pr28.sh rollback` re-tags the previous images and checks out `b7e4c93`. Migration 0007 only added a nullable column; a full DB restore is `pg_restore --clean --if-exists` from `db.dump`.

## Update — PR #30 (existing-vehicle Excel import), 2026-11-02

Owner approved installing PR #30 on the Manage Preview only. Approval covers the feature, not test-data removal or importing the real vehicle file; none was done.

- **CI:** final head `439e92b` passed 6/6 checks. Images were built by draft PR #31 (PR #30 plus only the image-export CI step), run 41413134903. Source merge commit `83278e0` differs from `439e92b` only in `.github/workflows/ci.yml`. The archive SHA-256 was verified locally and on the VM, and image IDs match the CI manifest. The archive was copied in verified 5 MB chunks.
- **Backup:** `/home/manage/backups/pr30-20261102T083407Z` contains `pg_dump -Fc` (188 entries), `.env`, Preview config, previous git head and image IDs, counts, SHA256SUMS and `deploy-pr30.sh`. A test restore into a temporary database matched (users 8, Authenticator 1, cases 5, audit 85, migrations 8); the temporary database was dropped. Previous images are tagged `before-pr30-20261102T083407Z`.
- **Install:** only API and web were recreated. Caddy, the gate, the database and `.env` (byte-identical) were untouched. The checkout is clean at `439e92b`.
- **Verification:**
  - All services are healthy, and health reports ok/postgres/preview.
  - Migration 0008 applied (9 migrations); the `vehicle_imports` and `vehicle_import_rows` tables and `cases.admission_no` exist.
  - Users, active accounts, enrolled Authenticators, cases, tasks, parts, audit, invitations and the 6 existing sessions are identical before and after. No import has run.
  - Over public HTTPS: `/login` returns 200 and `totpEnabled` is true. Anonymous `/` and `/cases/import` redirect to `/login`, and anonymous imports, sample and invitation APIs return 401.
  - The authenticated import page and the owner's own sign-in can only be checked by the owner (personal sign-in only).
- **Rollback:** `bash /home/manage/backups/pr30-20261102T083407Z/deploy-pr30.sh rollback` returns to the `e042d9f` images and code. Migration 0008 is additive; a full DB restore is `pg_restore --clean --if-exists` from `db.dump`.

## Update — full reports center (PR #32), 2026-11-02

Owner explicitly authorized completion, testing and deployment to the existing isolated Manage Preview. Deployed application head: `5e529fd5c01c61e4f440af71b2a26458220fb5ff`. All 6 CI checks passed in run 41424078886. Exported image source `2c4c4d2da5bd0676d0830ef22125e444312fe2cf` has the identical tree; archive SHA-256 and both loaded image IDs were checked locally/on the VM. The code was delivered in a Git bundle and installed detached, preserving a clean server checkout. No main merge occurred.

Verified restorable pre-install backup: `/home/manage/backups/stage3-20261102T123555Z` (DB dump, private configuration, old code and image references, before/restored/after counts, checksums and rollback script). Restore drill used a separate temporary DB. Only API/web were recreated; database, Caddy, gate and .env were retained. Migration 0009 adds the discrepancy table; migration count 9 -> 10. Preserved: users 8, enrolled TOTP 1, cases 5, tasks 6, parts 4, audit 88. Health API/web/db/gate passed.

The owner's existing browser session remained valid. Live reports and statistics loaded, discrepancy queue loaded, and a 5-row PDF downloaded from the deployed server; the complete PDF was rendered and inspected. No real vehicle file was imported and no synthetic operational data was purged. Source, DNS, firewall and authentication configuration were not modified.

Rollback: `bash /home/manage/backups/stage3-current/deploy-stage3.sh rollback` restores the previous application images and source. The additive table may remain; the DB dump is preserved if a database restore is explicitly needed.
