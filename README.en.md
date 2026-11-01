# Manage by HEDAX

**Dealership operations platform — phase 1: accident-repair vehicles.**

[فارسی](README.md) · [API](docs/API.md) · [GitHub workflow](docs/GITHUB_WORKFLOW.md) · [Architecture](docs/ARCHITECTURE.md) · [Progress](PROGRESS.md) · [Roadmap](docs/ROADMAP.md)

> **Branch scope:** this guide describes the TypeScript platform in stacked PRs #16–#21 and the documentation descendant. `main` still holds the legacy prototype until an owner-approved merge. See [branch/CI audit](docs/GITHUB_AUDIT.md).
>
> **Status: hosted personal-authentication Preview.** The owner reports completing their own login. Runs with synthetic data only. Not yet installed on the dealership server, not connected to any official system (manufacturer, roadside assistance, insurers, inventory, accounting), and offline/LAN sync is not active yet. See [PROGRESS.md](PROGRESS.md).

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

Versioned assessment and supplements, the parts lifecycle (with Excel import), the financial purchase gate, and QC with corrective work, technical and financial close and the vehicle handover are implemented (branches `feature/assessment-parts`, `feature/parts-finance`, `feature/qc-delivery`). Local Preview: `pnpm preview` → http://localhost:3100. Next deliveries: part-discrepancy review queue, reports and Persian PDF, then LAN server + cloud sync.

## Hosted Preview sign-in

Private invitation → choose a personal password → enroll Google Authenticator → sign in with email, password and a fresh code. Email is an identifier; there is no automatic mail delivery. Local shared demo credentials do not work in personal mode. [Persian sign-in guide and recovery limitations](docs/PERSONAL_AUTH_FA.md).

## Run locally (no Docker, no PostgreSQL install)

Requires Node.js 22+ and pnpm 10.

```bash
git clone https://github.com/ali-hedax/manage-dealership-platform.git
cd manage-dealership-platform
git switch feature/personal-auth-totp  # main does not yet contain the platform
pnpm install --frozen-lockfile
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

`apps/api` (NestJS, Drizzle, PostgreSQL) · `apps/web` (Next.js) · `packages/shared` (contracts, permissions, Jalali dates) · `docs/`. The earlier single-file prototype `index (4).html` is kept unchanged; see [the audit](docs/GITHUB_AUDIT.md) and [gradual feature migration plan](docs/PROTOTYPE_MIGRATION.md). The active web/API application already uses TypeScript.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) · [Workflows](docs/WORKFLOWS.md) · [Deployment](docs/DEPLOYMENT.md) · [Backup/restore](docs/BACKUP_RESTORE.md) · [Offline roadmap](docs/OFFLINE_SYNC.md) · [Roadmap](docs/ROADMAP.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [Progress](PROGRESS.md)

## Rights

Maintainer: [ali-hedax](https://github.com/ali-hedax). No open-source license is granted; a public repository does not permit redistribution of the code or the brand. The license type is the owner's decision.
