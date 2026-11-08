# Vehicle-first Manage redesign — approved scope (2026-11-08)

Owner authorized implementation, testing, merge and production deployment, subject to passing safeguards. This document is an implementation brief, NOT evidence that features are implemented.

## Core UX
- Role home pages for parts clerk and accident supervisor display ONLY searchable vehicle rows, with a per-vehicle "Actions" icon and count of genuinely outstanding actions. Details collapsed by default.
- A single canonical vehicle case workspace contains all actions currently scattered across part selection, parts orders, case parts, assessment, workshop, financial, reports and history. Avoid duplicate writes and duplicate data sources. Deep links from old routes should lead to the appropriate case panel.
- Each panel opens inline in the same case workspace; secondary data stays collapsed. RBAC enforced server-side.
- Parts have independent supply state, official Emdad reference and supplier/order details, quote and approval, stock, receipt inspection, readiness, assigned recipient, physical handover acknowledgment and actual consumption. Do NOT infer consumption from purchase or handover.
- Select an eligible recipient from ALL authorized active staff, regardless of the vehicle's current workshop station. Do not tie recipient selection to current vehicle station. Keep case linkage, recipient identity, timestamp and audit; assignment/notification is NOT physical handover.
- Preserve official payer approvals, prepayment gates, optimistic concurrency, tenant isolation and immutable audit. Manage AI may suggest but cannot approve finances or official orders.

## Reporting
- Every case has filters and downloadable PDF/Excel/A4 reports for parts by state, actual consumption, actions with actor and time, workshop stages, blockers, approvals, and finance within permissions.
- Manager dashboard aggregates from the SAME canonical operational records: vehicles in progress, overdue cases, aging blockers, missing parts, pending approvals, station throughput, and actionable drill-down into each case. Distinguish recorded blocker reason from inferred possible cause. No unsupported blame or invented metrics.
- Define event timestamps and source references, ensure audit trail, pagination, export authorization and no PII leakage between roles/tenants.

## Staff login
- Inspect existing PR #68 and deployment status before coding. Simplify ordinary staff PIN/device login only with secure rate limiting, lockouts, trusted device checks and role permissions; preserve strong owner/manager authentication. Confirm actual production version rather than assuming prior documentation is current.

## Delivery gates
1. Inventory actual routes, API handlers, schema and existing PRs; reconcile with latest main and production SHA.
2. Implement incrementally on feature/vehicle-first-workspaces, preserving backward compatibility and historical data.
3. Run lint, typecheck, unit/integration, E2E and accessibility checks; record results in docs/TEST_REPORT.md, update PROGRESS.md and CHANGELOG.md.
4. Before merge/deploy: CI green, migrations rehearsed on restored backup, encrypted off-server backup verified, rollback images pinned, and production window checked.
5. Deploy only Manage (never Source), validate health, login for ordinary staff and manager, case parts flow, exports and manager dashboard. Report actual deployed SHA and any outstanding work.

User preference: do not stop for minor design choices; choose simple professional RTL UX. Never claim an untested feature is complete.
