# Security

## Reporting

Report vulnerabilities privately to the maintainer ([ali-hedax](https://github.com/ali-hedax)) — not in public issues. This repository is **public**: never put real customer data, credentials, server addresses or screenshots of production in issues, PRs or commits.

## Controls in place

| Area | Control | Code |
| --- | --- | --- |
| Authentication | Server-side sessions; random 256-bit token in an httpOnly, SameSite=Lax cookie (`Secure` behind HTTPS via `COOKIE_SECURE=true`); only the SHA-256 of the token is stored; sliding 12 h expiry; logout revokes | `apps/api/src/auth` |
| Passwords | scrypt (N=16384, r=8, p=1, 16-byte salt), constant-time compare; dummy verification for unknown users | `auth/password.ts` |
| Brute force | 5 failed logins → 15 min lock; 10 login requests/min/IP; 600 requests/min/IP overall | `auth.service.ts`, `bootstrap.ts` |
| Authorization | RBAC enforced by the API on every route (`SessionGuard` + `@RequirePermissions`) and action-level checks in services; frontend hiding is cosmetic | `packages/shared/src/permissions.ts` |
| Tenant isolation | Every query filters by the session's tenant; cross-tenant ids return 404 (tested) | services |
| Personal data | Customer phone masked for roles without `customer.pii.read`; system admin cannot read cases | `cases.service.ts` |
| CSRF | Custom `x-manage-client` header required on every state-changing request; same-origin proxy; no CORS unless allow-listed | `bootstrap.ts` |
| Input | zod validation on every body/query/param; Persian error messages without internals | `packages/shared/src/schemas.ts` |
| Headers | helmet on the API; nosniff, frame deny, same-origin referrer on the web | `bootstrap.ts`, `next.config.ts` |
| Audit | Append-only `audit_events` (DB trigger) with actor, time, reason, before/after, request id, IP; login events | `audit.service.ts`, migration 0001 |
| Logs | Structured JSON; cookies, auth headers and set-cookie redacted; passwords never logged | `app.module.ts` |
| Secrets | `.env` git-ignored; `.env.example` placeholders only; demo password generated and written to a git-ignored file | `.gitignore` |
| Supply chain | `pnpm audit` (high), advisory dependency review on PRs (until dependency graph is enabled), blocking gitleaks secret scan in CI | `.github/workflows/ci.yml` |

## Known gaps (tracked)

- Personal Preview mode implements invitation-based password + TOTP authentication (PR #21), encrypted seeds, single-use challenges, replay rejection and tenant-scoped invitation administration. See [personal sign-in](docs/PERSONAL_AUTH_FA.md). Local synthetic demo mode remains separately configurable.
- Owner-issued staff recovery links exist: single use, one hour, owner only, never for the owner account, and all old sessions end on completion. Full user lifecycle, self-service password/factor recovery, owner account recovery, backup codes and established production recovery procedures remain incomplete (#14). Never reset a personal-mode demo database to recover an account. Preserve AUTH_TOKEN_SECRET with private database backups; losing/rotating it makes stored TOTP seeds unreadable.
- Rate limiting is per IP. Without a reverse proxy that sets `X-Forwarded-For`, all users behind the web container share one IP bucket — deploy behind Caddy/Nginx.
- File uploads (photos, documents) not implemented yet; object storage, size/type validation and malware scanning are required when added.
- A private pre-rollout backup was verified by archive listing on the isolated Preview; a full restore/failure drill for production and dealership LAN remains required. See [backup procedure](docs/BACKUP_RESTORE.md) and the [deployment record](docs/PREVIEW_DEPLOYMENT_20261101.md).

## Staff invitation email

Invitation email requires user.manage; the host/from/credentials are server configuration, never client-controlled. Implicit TLS or mandatory STARTTLS is used with certificate verification, transport logs disabled and file/URL loading disabled. Raw SMTP failures are discarded, while sanitized sent/failed audit events and per-challenge delivery states remain. The email endpoint never returns the invitation URL. The manual bootstrap/link endpoint remains explicitly authorized and excluded from generic response caching. No automatic email retry queue or inbox-delivery guarantee is claimed. SMTP credentials must never enter Git; Gmail sender setup is performed privately by the owner.
