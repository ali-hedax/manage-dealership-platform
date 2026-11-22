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

6. Shared `advanceAssessmentPackage`: guarded draft → submitted → review → finalized transition rules and unsafe deletion guard; tests. This is a **pure state machine**, NOT YET connected to API or UI.\n7. Shared `aggregateStaffActivity`: allowlisted event attribution by authenticated employee ID, deduplication, unknown-actor and test-event exclusions; tests. This is **not yet connected to SQL aggregation or a manager report**.\n\n## Not implemented — DO NOT CLAIM COMPLETE
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
