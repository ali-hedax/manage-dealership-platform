# GitHub workflow and delivery tracking

## Current model

Code is developed in independent branches and reviewed through PRs. The owner approved integration of #16 → #17 → #18 → #20 → #19 → #21 → #23, now merged into main at eaa7c66. Branch new platform work from current main. Legacy prototype branches remain separate.

See [audit](GITHUB_AUDIT.md) for the exact stack and hashes. Never merge to main, force-push, delete branches or close old PRs without owner approval. Prefer preserving divergent work in a separate branch over replacing it.

## Labels and milestones

Keep the existing type:, area:, status: and needs: labels. Each issue has one primary status: backlog → ready → in progress → review → testing → done. Review means implemented on a PR but not accepted/merged. Testing means pending acceptance validation. Do not mark done merely because CI passed. Owner decisions use needs: owner decision; infrastructure/access blockers use needs: access. Preserve unrelated labels when moving status.

| Milestone | Scope | Remaining acceptance |
| --- | --- | --- |
| Delivery 1 — Usable preview | Core cases, tasks, blockers, isolated Preview | Owner acceptance, approved integration, domain/operating decisions |
| Delivery 2 — Assessment, parts, finance, QC | #8–#12 | Discrepancy queue #11 and acceptance/integration of implemented PRs |
| Delivery 3 — Reports and staff testing | #13–#14 | Reports/PDF, administration/recovery, staff pilot |
| Delivery 4 — LAN server and sync | #7, #15 | IT answers, sync protocol and actual LAN failure drills |

## Board access fallback

Project Board setup is blocked by token scope: read:project is missing; editing a Projects v2 board needs project. No board has been created. Do not reauthenticate or broaden scopes silently. Once project access is enabled, inspect existing boards, reuse a matching Manage board or create one, link this repository, add the existing issues/PRs and map statuses to the columns above. Avoid duplicate issues or invented delivery dates.

Until then these views provide usable tracking:

- [Awaiting review](https://github.com/ali-hedax/manage-dealership-platform/issues?q=is%3Aopen+label%3A%22status%3A+review%22)
- [Owner decisions](https://github.com/ali-hedax/manage-dealership-platform/issues?q=is%3Aopen+label%3A%22needs%3A+owner+decision%22)
- [Offline and sync](https://github.com/ali-hedax/manage-dealership-platform/issues?q=is%3Aopen+label%3A%22area%3A+sync%22)
- [Milestones](https://github.com/ali-hedax/manage-dealership-platform/milestones)
- [Open PRs](https://github.com/ali-hedax/manage-dealership-platform/pulls)

## Review and validation

Use the issue/PR templates, provide acceptance evidence and schema/permission impact, and keep synthetic testing distinct from live validation. CI runs documentation links/API-inventory checks plus lint/typecheck/build, unit/API integration, PostgreSQL migration, Playwright, Docker/HTTPS and dependency/secret scans. Documentation checks require only Node and Git; run node scripts/check-docs.mjs locally. No CI workflow deploys Production.
