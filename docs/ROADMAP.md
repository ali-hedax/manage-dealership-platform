# Roadmap

Dates are working-day targets from 2026-11-01, conditional on access and feedback; they are not commitments. Status is updated in [PROGRESS.md](../PROGRESS.md).

| Delivery | Target | Scope | Status |
| --- | --- | --- | --- |
| 0 | Day 1 | Repository audit, decisions, docs, branch, buildable skeleton, CI | **Done** (this PR) |
| 1 | Days 3–5 | Usable preview: login, dashboard, cases (create/edit/search, legacy entry), coverage basics, responsible + deadlines, repair activities with start/block/complete/approve, blockers, timeline, demo data, tests, user guide | **Hosted Preview delivered**; owner reports personal login; acceptance and main integration pending |
| 2 | Days 7–12 | Assessment + supplements (versioned), parts lifecycle (manual + Excel import), approvals, advance payment and financial gate, "part not arrived" discrepancy check, QC + corrective work, technical vs financial close, delivery handover, first alerts | Most workflows implemented (#17/#18/#20); discrepancy queue #11 and acceptance remain |
| 3 | Days 20–30 | Daily/weekly/monthly reports, Persian PDF/Excel (embedded font, A4, checked visually), user management + password change + manager MFA, rule-based delivery forecast, settings UI (departments), staff testing at the dealership | Personal MFA/invitations implemented (#21); reports, full account lifecycle/recovery and staff testing remain |
| 4 | After server review | Install on the dealership LAN server, cloud ↔ LAN sync agent, offline status UI, failure drills (internet, LAN, server, cloud, conflicting edits, restore), limited pilot with real cases | Planned — needs IT answers |

Initial estimate for a stable phase 1 including offline: about 7–11 calendar weeks of steady work; revise after delivery 2.

## Later platform modules (navigation shows "در دست توسعه")

General reception and service, periodic service and warranty; inventory, suppliers and purchasing; advanced finance and accounting integration; workforce capacity and technician mobile worklist; customer SMS, satisfaction and portal; multi-dealership / multi-brand SaaS; official integrations (manufacturer, roadside, insurers, inventory, accounting) where authorized; AI assistant (RAG, bottleneck analysis, delivery-time suggestions) built on real data, never issuing approvals or blame.
