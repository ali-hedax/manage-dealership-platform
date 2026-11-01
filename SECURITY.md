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
| Supply chain | `pnpm audit` (high), dependency review on PRs, gitleaks secret scan in CI | `.github/workflows/ci.yml` |

## Known gaps (tracked)

- MFA for manager/admin accounts — not yet implemented.
- User management UI and password change — accounts are seeded; production accounts need an admin flow before go-live.
- Rate limiting is per IP. Without a reverse proxy that sets `X-Forwarded-For`, all users behind the web container share one IP bucket — deploy behind Caddy/Nginx.
- File uploads (photos, documents) not implemented yet; object storage, size/type validation and malware scanning are required when added.
- Backups and restore drill exist only as a procedure ([docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)) until a server is provisioned.
