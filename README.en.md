# Manage by HEDAX

**Dealership operations platform — phase 1: accident-repair vehicles.**

[فارسی](README.md) · [Architecture](docs/ARCHITECTURE.md) · [Progress](PROGRESS.md) · [Roadmap](docs/ROADMAP.md)

> **Status: first preview.** Runs with synthetic data only. Not yet installed on the dealership server, not connected to any official system (manufacturer, roadside assistance, insurers, inventory, accounting), and offline/LAN sync is not active yet. See [PROGRESS.md](PROGRESS.md).

Manage tracks every accident-repair vehicle from admission to delivery, so the service manager and accident supervisor can see where each car is, what it is waiting for, and who has to act. Persian (RTL) is the default language; tenants (dealerships) are separated in the data model from day one.

## Working today

- Login with separate roles; permissions enforced by the API
- Cases with vehicle and owner; search by plate, VIN, name, phone or case number
- Coverage type (golden card / roadside, body insurance, personal, mixed, unknown)
- Three independent times: official deadline, internal forecast, actual delivery
- Legacy entry of vehicles already in the workshop, with past admission time
- Repair activities per department with dependencies; start / block / complete / supervisor approval
- Blockers with occurrence time, recording time, follow-ups and resolution
- Manager dashboard whose counts link to the exact filtered lists
- Append-only audit trail (database trigger)

Versioned assessment and supplements are implemented on `feature/assessment-parts`. Next deliveries: parts, financial gate, QC and delivery, reports and Persian PDF, then LAN server + cloud sync.

## Run locally (no Docker, no PostgreSQL install)

Requires Node.js 22+ and pnpm 10.

```bash
pnpm install
pnpm dev
```

Web on <http://localhost:3000>, API health on <http://localhost:4000/api/v1/health>. The first run creates a synthetic demo dealership; usernames and the shared password are written to `apps/api/.data/demo-credentials.local.txt` (git-ignored).

## Full stack on PostgreSQL

```bash
cp .env.example .env   # set POSTGRES_PASSWORD and SEED_DEMO_PASSWORD
docker compose up -d --build
```

## Tests

```bash
pnpm test       # unit + API integration tests (embedded PostgreSQL)
pnpm build
pnpm test:e2e   # Playwright
```

Latest results: [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Layout

`apps/api` (NestJS, Drizzle, PostgreSQL) · `apps/web` (Next.js) · `packages/shared` (contracts, permissions, Jalali dates) · `docs/`. The earlier single-file prototype `index (4).html` is kept unchanged; see [docs/GITHUB_AUDIT.md](docs/GITHUB_AUDIT.md).

## Rights

Maintainer: [ali-hedax](https://github.com/ali-hedax). No open-source license is granted; a public repository does not permit redistribution of the code or the brand. The license type is the owner's decision.
