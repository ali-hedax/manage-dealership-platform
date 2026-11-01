# Changelog

All notable changes. Versions follow semantic versioning once releases start.

## [Unreleased] — branch `feature/qc-delivery`

### Added
- Quality control and delivery (issue #12): QC checklist per round (10 items; safety items cannot be skipped). A failed item needs a description and a unit, opens a corrective activity and returns the case to repair; a new round is required after any later change to the work.
- Technical close (supervisor/manager) only when all work is approved, no blocker is open, no draft or pending authorization remains, every approved replaced line has a part handed over to the unit and the latest QC passed. Labour without a matching approved activity is shown as a warning.
- Financial close (cashier/manager) as a separate gate: final assessment, known customer share, no pending finance proposal and the customer share received — or a service-manager decision to accept the remaining balance, with a reason. Settlement payments are recorded by the cashier with a receipt reference.
- Handover with recipient name and relation, time and the recipient's confirmation; needs both closes and archives the case (status closed, read-only). A close that no longer matches the case (reopened work, new share or estimate) must be repeated.
- Case page: "کنترل کیفیت و تحویل" panel with QC history and what still blocks each step; corrective activities are marked; history labels for the new events.

### Changed
- The stage selector can no longer set "آماده تحویل" or "تحویل‌شده"; they come from the technical close and the handover. Moving a closed case back into the workflow cancels its technical close.
- Demo case 5 shows a failed QC round, the corrective work, a passed round and the technical close; settlement and handover are left to try.

## [Unreleased] — isolated Preview deployment (2026-11-01)

- Preview updated with QC, corrective work, technical/financial close and handover (merge of PR #20 into the Preview branch only); demo data recreated.

- Dedicated ArvanCloud Preview with trusted HTTPS, password gate and synthetic data is available; see docs/PREVIEW_DEPLOYMENT_20261101.md. Source and Production remain unchanged.
- Fix Arvan SSH configuration precedence and socket-activated service startup; explicitly install Buildx, normalize application file umask, and keep generated credentials out of command logs.

## [Unreleased] — branch `feature/parts-finance`

### Added
- Parts lifecycle (issue #9): needs from authorized assessment lines, manual entry or .xlsx import with preview (synthetic sample download); stock check, reservation, order with supplier/price/ETA (first ETA kept), receipt with inspection (wrong/defective → re-order), handover to the repair unit, cancel — each with its time.
- Ordering requires the assessment line's authorization; a price above the approved price needs the assessor's approval reference.
- "Part not arrived" blockers can name the part; its handover resolves them and returns the activity to work.
- Financial gate (issue #10): payer shares, advance proposed by the expert, approved by the service manager (never their own proposal), receipt confirmed by the cashier; exceptions with a spending limit. Only part purchases are held; a supplement raising the estimate needs a new approval.
- Dashboard and case-list filters: waiting for authorization, overdue parts, parts not ordered, pending finance decision/receipt.
- Local Preview: `pnpm preview` (production build, persistent synthetic data, http://localhost:3100).

### Changed
- Login rate limit can be set with `LOGIN_RATE_LIMIT` (default unchanged: 10 per minute); the E2E suite raises it.

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


## Preview browser sign-in compatibility — 2026-11-01

- Replace the native browser password challenge with an accessible Persian sign-in form and a signed secure cookie, preserving the Preview password and isolation. Actual in-app browser login to the manager dashboard was verified.
