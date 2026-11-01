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
