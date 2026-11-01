# Changelog

All notable changes. Versions follow semantic versioning once releases start.

## [Unreleased] — branch `feature/assessment-parts`

### Added
- Versioned assessments and supplements (issue #8): initial assessment and supplements after hidden damage with replace/repair lines, part numbers, quantities, prices and labour per department, evidence references; the approved version is kept unchanged when a supplement is finalized.
- Authorization recording: source, method, official reference (required for golden card and insurer), partial approval per line; an «مجوز» blocker holds the case (and delivery) until the decision is recorded.
- A supplement can move the internal delivery forecast; the official deadline is untouched. Supplements that raise the cost are flagged for financial re-approval.
- Demo case 1 shows an approved assessment and a supplement waiting for authorization.
- History shows assessment changes with amounts in Rials. On phones the assessment lines are shown as stacked cards.

## [0.1.0] — Unreleased (branch `feature/accident-mvp`)

### Added
- Manage platform monorepo alongside the earlier prototype: `packages/shared`, `apps/api` (NestJS + Drizzle + PostgreSQL), `apps/web` (Next.js, Persian RTL).
- Login with roles (accident expert, accident supervisor, service manager, parts, cashier, QC, system admin); permissions enforced by the API; account lockout and rate limiting.
- Accident cases: vehicle and owner, coverage type and references, responsible person, official deadline vs forecast vs actual delivery, legacy entry with past admission, "needs completion" flags, search by plate/VIN/name/phone/number.
- Repair activities per department with dependencies, weights, planned/actual times; start, complete, supervisor approval, reopen with reason.
- Blockers with occurrence, recording, follow-up and resolution times; activity unblocks when its last blocker is resolved.
- Delivery gate (all activities approved, no open blockers).
- Manager dashboard: stage pipeline, attention list, blocker reasons, department load — each linked to the matching filtered list.
- Append-only audit trail (database trigger), change-log outbox, idempotency keys, optimistic locking.
- Synthetic demo dealership, auto-seeded in development/preview; reset script that removes only synthetic tenants.
- Iranian licence-plate display, Jalali date/time input in Tehran time, self-hosted Vazirmatn.
- Tests: shared unit tests, API integration tests, Playwright E2E (desktop + phone); CI with PostgreSQL 16, Docker compose smoke test, dependency audit and secret scan.
- Documentation set (architecture, database, workflows, offline sync design, security, deployment, backup/restore, roadmap, user guide, IT server checklist, GitHub audit).

### Security
- `drizzle-orm` raised to 0.45.x and `multer` overridden to ≥ 2.5.0 to clear high-severity advisories reported by `pnpm audit`.
