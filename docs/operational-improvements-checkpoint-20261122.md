# Manage operational improvements — resumable development checkpoint

This work is intentionally isolated from concurrent draft PR #119 (Special Aid). **Do not merge/deploy until both PRs have been assessed for compatibility.**

Branch: `feature/manage-operational-improvements-20261122`  
Draft PR: https://github.com/ali-hedax/manage-dealership-platform/pull/120  
Base main at creation: `b3bfc8f6bab6889c031f828cc72a05fad30638a8`

## Implemented and pushed
1. PWA label `نصب روی گوشی` → `نصب برنامه`; cross-device explanatory text, updated Playwright selectors and installation guide.
2. Technician workbench: ability to open any assigned vehicle from the list without finishing the current card; renamed secondary list `سایر خودروهای من`. This is a **UI navigation change**, not pause/resume support.
3. API E2E regression test: one technician starts three separate eligible vehicle jobs and finishes one without changing the others.
4. E2E regression test: insurance/personal cases accept Smart Manual Assessment while Golden Card rejects it. Existing backend and UI already implement this eligibility rule.
5. Shared `calculateEmployeeScore`: deterministic 30/25/25/20 weights, stable identity, insufficient-evidence response, formula version, input validation; unit tests. This is a **standalone calculation core**, not yet connected to real events, manager UI, or role-specific calibrated metric generation.

6. Shared `advanceAssessmentPackage`: guarded draft → submitted → review → finalized transition rules and unsafe deletion guard; tests. This is a **pure state machine**, NOT YET connected to API or UI.\n7. Shared `aggregateStaffActivity`: allowlisted event attribution by authenticated employee ID, deduplication, unknown-actor and test-event exclusions; tests. This is **not yet connected to SQL aggregation or a manager report**.\n\n## Additions: guided flow and legacy ISACO (same PR, later checkpoint)
8. After a successful assessment-to-parts dispatch, stay in the same case and open the finalization dialog instead of redirecting to the Parts tab. After successful finalization navigate to the repair-plan stage. No existing backend authorization is bypassed.
9. Case tab navigation now scrolls to the relevant stage and moves keyboard focus to the section summary when present.
10. Two subtle top/bottom page controls for long pages, respecting reduced motion and hiding when the page is short or printed.
11. Case folder header now shows brand, model, verified ISACO product code (or missing/conflict), then trim, with corresponding styling.
12. Regression test for a **legacy case created before** a matching historical customer import, confirming the case-detail lookup derives its code after import without rewriting the case.

## Legacy ISACO known limitation
The current `CasesService.isacoCodeOf` already performs a **read-time, exact VIN/chassis** lookup on every old and new case. The new regression test demonstrates this intended scenario, but **cannot prove real production historical cases have valid VIN/chassis and a matching source row**. Backfilling missing identifiers or repairing ambiguous codes requires a read-only audit of real production data followed by a separately verified, non-destructive reconciliation strategy. Never guess a product code from the model or plate.

## Not implemented — DO NOT CLAIM COMPLETE
- Pause/resume lifecycle: task status and event/schema/API/technician UI, lifecycle tests.
- Full-assessment submission to Parts Specialist; direct technical corrections, safe deletes, audit and whole-assessment finalization.
- Optional sectioned labour-entry UX and printout integration.
- Employee-specific reporting aggregation from validated operational events, role-specific metrics, revenue provenance, score confidence, manager report UI, traceable insights and permissions.
- End-to-end production validation/deployment/version confirmation.

## Confirmed current-code observations
- `TasksService.executeOwn` accepts only `start`/`complete`. A pause/resume action is NOT implemented.
- `TasksService.actIn` does not explicitly limit a technician to one active job; guided workflows and prerequisite dependencies may block **specific** jobs.
- Existing Smart Manual Assessment initial creation guards against non-insurance/non-personal coverage server-side; `AssessmentPanel` also gates the entry action.
- Current technical review is individual-item based, requiring a new coordinated package-level workflow.
- PWA is deliberately online-only without a service worker or offline customer-data cache. Preserve that design.

## Next safe development steps
1. Inspect latest `main`, PR #119 files and this branch before any overlapping changes.
2. Wait for current head SHA CI to settle; fix real failures.
3. Implement pause/resume using explicit per-task persisted state and audit history; avoid treating existing `blocked` as a technician pause.
4. Build assessment package service and tests with minimal additive schema, preserving downstream procurement controls.
5. Build optional labour UX and employee-event analytics, then manager UI.
6. Full CI; resolve PR119 conflicts; merge after review; backup+restore+safe production deployment and version confirmation.

## Verification rules
No local test execution was available in this GitHub-only step; CI must be checked for the exact final commit. All historical and synthetic test data must remain isolated from real production records. No production changes performed.


## Additional scope: coverage eligibility and case sorting
13. Smart Manual Assessment now checks `coverageType !== 'golden_card'` in both initial-create API and UI. The canonical values `insurance`, `personal`, `mixed`, and `unknown` are therefore eligible; official Golden Card remains excluded. A regression test exercises all five values.
14. Case-list sorting is validated in shared Zod query schema and applied by the API before pagination. Options: latest admission (default), oldest admission, highest case number, lowest case number. UI selector updates the URL, resets pagination, and preserves filters.
15. Added synthetic E2E sorting regression test. Do not claim success until the exact head commit passes CI.
16. Financial/payer-specific authorization remains a separate mandatory downstream control. Being eligible for Smart Manual Assessment does not imply automatic insurance approval or free procurement.

## 2026-11-23 — PR 120 integration checkpoint

- Verified PR 119 was merged in f8a1ca1 and main c636eea includes the subsequent ISACO chassis correction from PR 122. Integrated those commits on the PR 120 branch. The sole Git conflict was the shared barrel; retained the exports from both branches. PR 120 previously introduced no migrations.
- On 6b958c6, run 45032800839 passed five jobs. Chromium failed in assessment.spec.ts (stale expectation after finalization) and guided-workflow.spec.ts (redundant repair-plan click, then fixture collision on retry). Updated both scenarios to exercise the automatic transition and assert keyboard focus. The assessment scenario dispatches from a draft and checks that procurement received one item.
- Next: run the integrated regression suite, then finish persistent technician pause/resume, assessment package handoff and corrections, optional labour and employee analytics. Release remains pending independent backup, isolated restore, migration rehearsal and live confirmation.

### 2026-11-23 — independent technician pauses
Technician pause/resume persists in the existing transactional per-task audit stream with a required reason, tenant and assignee checks, expected version and working-time exclusion. No schema migration. Local synthetic API verification: 4 suites / 14 passed (technician-timing, smart-assessment, case-sorting, isaco-parts). Shared package/employee tests: 9 passed. Web TypeScript passed. Browser and complete CI verification pending.

Optional labour entry added to the smart draft, grouped by active department. Each explicit save uses an existing audited repair item, its existing totals and printable rows. Descriptions and amounts are optional. Browser regression added; verify final CI and A4 output.

Package milestone: full smart assessment submission and deduplicated parts-clerk notifications, tenant-scoped correction/removal with optimistic locks and immutable audit, existing downstream supply lineage guard, permission-gated whole-package finalization against current technical acceptances. Synthetic API regression added. CI and production outstanding.

Manager stats: named tenant roster, authenticated event counts and monthly technician score when at least five independently accepted jobs have evidence. Deadline, reopen and completion actor explain each dimension. Blocked/paused jobs are excluded. Other roles currently have activity summaries and insufficient-evidence status; role-specific score inputs outside technician work are incomplete. No revenue estimation. CI/production validation pending.

Added distinct accident-expert and parts-clerk evidence cohorts to the monthly report. Role-addressed follow-ups contribute progress, seen-by-reminder timing and documented replies. Independent technical decisions contribute the named quality signal. At least five qualifying decisions and five closed role-addressed follow-ups are needed for a numeric score. Multiple roles appear separately. Tenant permissions and test exclusions apply. Final CI and deployment pending.
