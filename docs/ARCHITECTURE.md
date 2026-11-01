# Architecture

## Overview

```
 Browser (Persian RTL)
     │  same origin: pages + /api/v1/*
     ▼
 apps/web  — Next.js 16 ──(runtime proxy, API_INTERNAL_URL)──►  apps/api — NestJS 11
                                                                   │  Drizzle ORM
                                                                   ▼
                                                     PostgreSQL 16  (PGlite for local dev/tests)
                                                     ├─ domain tables (tenant_id on every row)
                                                     ├─ audit_events  (append-only trigger)
                                                     └─ change_log    (outbox for future sync)
 packages/shared — enums, Persian labels, RBAC matrix, zod contracts, Jalali utilities
```

A modular monolith: one API process with domain modules, one web process, one database. No microservices; the offline/LAN requirement is met later by running the same stack on a local server and syncing through `change_log` (see [OFFLINE_SYNC.md](OFFLINE_SYNC.md)).

## Modules

| Module | Location | State |
| --- | --- | --- |
| Identity & access (sessions, roles, permissions) | `apps/api/src/auth`, `packages/shared/src/permissions.ts` | Implemented |
| Tenant (dealership) | `tenants` table, `tenant_id` everywhere | Implemented (single active tenant) |
| Customer, vehicle | `apps/api/src/cases` (upsert by phone / VIN) | Implemented |
| Accident cases | `apps/api/src/cases` | Implemented |
| Repair activities (workflow, tasks) | `apps/api/src/tasks` | Implemented |
| Blockers / delay accountability | `apps/api/src/blockers` | Implemented (discrepancy check needs parts module) |
| Dashboard | `apps/api/src/dashboard` | Implemented |
| Audit | `apps/api/src/audit` + DB trigger | Implemented |
| Sync | `change_log`, idempotency keys, `version` columns | Foundations only |
| Assessments & supplements (versioned, authorization recording) | `apps/api/src/assessments` | Implemented |
| Parts lifecycle, Excel import | `apps/api/src/parts` (minimal .xlsx on `fflate`) | Implemented |
| Financial gate (shares, advance, exceptions) | `apps/api/src/finance` | Implemented |
| Advanced finance, QC, documents, reports, notifications, integrations, AI, settings UI | `MODULES` in `packages/shared/src/enums.ts` | Planned; navigation shows "در دست توسعه" |

## Request path and cross-cutting concerns

1. `configureApp()` (`apps/api/src/bootstrap.ts`): helmet headers, cookie parsing, CSRF header check (`x-manage-client` on every non-GET), optional CORS allow-list, `/api/v1` prefix.
2. Guards: `ThrottlerGuard` (global 600/min/IP, login 10/min/IP) then `SessionGuard` (session cookie → user → `@RequirePermissions`).
3. `IdempotencyInterceptor`: repeated POST/PATCH with the same `Idempotency-Key` returns the stored response.
4. Controller validates input with zod schemas from `packages/shared` (`ZodPipe`).
5. Service runs one transaction: load with tenant filter → check version/state → write → `AuditService.record()` writes the audit row and change-log row.
6. `HttpExceptionFilter` returns `{statusCode, code, message, details?, requestId}`; messages are Persian.
7. Structured JSON logs (pino) with request ids; cookies and auth headers are redacted.

## Decisions (ADR log)

| # | Decision | Reason | Cost / migration path |
| --- | --- | --- | --- |
| 1 | TypeScript monorepo, Next.js + NestJS + PostgreSQL as briefed | One language end-to-end; Nest gives module boundaries and DI | Two runtimes to deploy (web, api) |
| 2 | **Pinned proven majors**: TypeScript 5.9, NestJS 11, Next 16, Zod 4, Drizzle 0.45 | At build time npm offered TypeScript 7 and NestJS 12 (ESM-only), which change decorator/module behaviour; stability first | Upgrade in a dedicated PR with the full test suite |
| 3 | **Drizzle ORM** with SQL migrations (drizzle-kit) + hand-written down scripts | Typed queries close to SQL, same API for node-postgres and PGlite | Down migrations are manual (`apps/api/src/db/down/`) |
| 4 | **PGlite** (embedded PostgreSQL/WASM) for local dev, demo and tests | `pnpm dev` works without Docker or a DB install; tests run real PostgreSQL SQL, triggers included | Not for production (config refuses it); CI also migrates on real PostgreSQL 16 |
| 5 | Server-side sessions in DB, httpOnly cookie, scrypt hashing (Node stdlib) | Revocable sessions; no native add-on to build on an unknown dealership server | MFA for managers is a later addition |
| 6 | Same-origin runtime proxy in Next (`app/api/v1/[...path]`) | First-party cookie, no CORS; API URL configurable per environment at runtime | One extra hop |
| 7 | UUIDv7 ids generated in the app; `version` column; `change_log` outbox | Ids unique across cloud and LAN nodes; conflict detection; sync replay | Human case numbers (`AC-1405-0001`) are allocated per node today — needs a node prefix before multi-node writes |
| 8 | Fixed UTC+03:30 for Jalali conversion | Iran dropped DST in 2022; deterministic on server, browser and tests | Dates before Sept 2022 may be off by one hour |
| 9 | Self-hosted Vazirmatn (no Google Fonts) | Google Fonts is unreliable from Iran; LAN must work without internet | — |
| 10 | Case stage set explicitly (auto-advance only "first task started → in repair") | Explainable rules first; stage derivation from parts/QC comes with those modules | — |

## Environments

| Environment | Database | Data | Notes |
| --- | --- | --- | --- |
| Development | PGlite file in `apps/api/.data` | Synthetic, auto-seeded | `pnpm dev` |
| Test / CI | PGlite in memory; PostgreSQL 16 service in CI | Synthetic | `pnpm test`, `pnpm test:e2e` |
| Preview / Staging | PostgreSQL (Docker Compose) | Synthetic, auto-seeded | Not yet hosted; see [DEPLOYMENT.md](DEPLOYMENT.md) |
| Production (cloud) | PostgreSQL | Real | Needs owner approval, domain, backups |
| Dealership LAN server | PostgreSQL | Real | After IT checklist ([IT_SERVER_CHECKLIST_FA.md](IT_SERVER_CHECKLIST_FA.md)) |
