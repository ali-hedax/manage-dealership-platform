# Test report

Last full run: **2026-11-01**, branch `feature/accident-mvp`, Windows 10 / Node 26.8 locally (CI targets Node 22 on Ubuntu). All data synthetic.

## Summary

| Suite | Command | Result |
| --- | --- | --- |
| Lint (ESLint on API, tsc on shared/web) | `pnpm lint` | ✅ pass |
| Typecheck | `pnpm typecheck` | ✅ pass |
| Shared unit tests (Jalali, digits, plates, phones, RBAC, schemas) | `pnpm --filter @manage/shared test` | ✅ 9 / 9 |
| API unit + integration (Jest + supertest, real HTTP, embedded PostgreSQL) | `pnpm --filter @manage/api test` | ✅ 35 / 35 (3 suites) |
| Production build (API + web) | `pnpm build` | ✅ pass |
| E2E (Playwright, Edge, desktop 1366×860 + Pixel 7) | `pnpm test:e2e` | ✅ 5 / 5, three consecutive runs (see below) |
| Dependency audit (prod, high) | `pnpm audit --prod --audit-level high` | ✅ no known vulnerabilities (after drizzle 0.45 + multer override) |
| `pnpm dev` from an empty database | manual | ✅ API healthy, demo auto-seeded, web proxy 200 |
| Migrations + seed on PostgreSQL 16 | CI job `postgres` | ⏳ runs on GitHub Actions for this PR |
| Docker images + compose smoke test | CI job `docker` | ⏳ runs on GitHub Actions. **Not verified locally**: the dev machine has 8 GB RAM and 5.6 GB free disk, and the Docker daemon crashed twice during builds |

## Acceptance scenarios (brief §11)

| # | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Create a case and search it | ✅ | API: "creates a case … finds it by plate, VIN, name, phone and number"; E2E: supervisor flow ends with plate search |
| 2 | Golden card with official deadline, waiting for company part | ◐ | API: deadline separate from forecast, reason required to change, `part_not_arrived` blocker on the activity. Parts lifecycle itself: issue #9 |
| 3 | Body insurance with price change and assessor approval | ○ | Needs assessment + parts (issues #8, #9) |
| 4 | Personal case with advance payment and customer approval | ○ | Needs financial gate (issue #10) |
| 5 | Supplement after hidden damage | ○ | Issue #8 |
| 6 | Multiple departments and technicians, parallel and dependent work | ✅ | API: dependencies enforced, parallel start, weighted progress 50 %, cycle rejected; E2E: dependency-aware start button |
| 7 | "Part not arrived" while handover is recorded → reviewable discrepancy | ○ | Needs parts module (issue #11) |
| 8 | Block costly purchase without financial approval, allow no-cost work | ○ | Issue #10 |
| 9 | QC, corrective work, settlement, delivery | ◐ | API: delivery gate (all approved, no open blockers), reopen requires reason, actual delivery time. QC/settlement: issue #12 |
| 10 | Roles and denial of unauthorized access | ✅ | API: unauthenticated 401, CSRF 403, support roles 403 on create/tasks, expert cannot block activities, admin cannot read cases, masked phone, tenant isolation 404, lockout; E2E: parts clerk read-only view |
| 11 | Old vehicles with past admission date | ✅ | API: past admission + current stage + overdue/legacy filters; E2E: legacy entry form |
| 12 | Reports and correct Persian PDF | ○ | Issue #13. Print view exists; PDF not yet |
| 13 | Offline / sync / backup / restore | ○ | Design only (docs/OFFLINE_SYNC.md); needs server (issues #7, #15) |

✅ automated and passing · ◐ partly covered · ○ not built yet

## Other verified behaviour

- Audit rows cannot be updated or deleted, even with direct SQL (trigger); demo reset deletes only `is_test` tenants.
- Every change writes a change-log entry in the same transaction.
- Repeated `Idempotency-Key` replays the stored response instead of creating a duplicate case.
- Stale `expectedVersion` returns `409 VERSION_CONFLICT`.
- Dashboard card counts equal the totals of the lists they link to (all 7 flags).
- Demo seed creates 5 realistic cases through the real services (stages, overdue, blocker, ready, legacy).
- Phone width: no horizontal scrolling on dashboard and case list; menu opens.

## Defects found by tests and fixed

| Found by | Defect | Fix |
| --- | --- | --- |
| E2E | Resolving a blocker in the same minute it was recorded failed: the date field re-parsed the time at minute precision on blur, earlier than the exact creation time | Input keeps the precise value when its text is unchanged; API accepts minute precision for ordering checks (regression test added) |
| E2E (intermittent) | After committing the date, the time field could be reset while the user was typing, saving 00:00 | Input re-syncs only on external value changes |
| E2E | Search tests clicked the first row before the debounced search applied | Tests wait for the URL query and row count |
| Startup log | Express 5 rejected the logger's bare `*` route | Named wildcard |
| Audit | High-severity advisories in drizzle-orm and multer | Upgrade / override |

## E2E consecutive runs (flakiness check)

After the date-input fix, on 2026-11-01 (desktop + mobile projects, Edge):

| Run | Result | Duration |
| --- | --- | --- |
| 1 | 5 passed | 54.8 s |
| 2 | 5 passed | 1.0 min |
| 3 | 5 passed | 57.8 s |
