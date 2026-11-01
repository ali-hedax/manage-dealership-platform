## Problem and resulting behavior

<!-- What was wrong or missing, and what the user can do now. Link the issue: Closes #… -->

## Validation performed

<!-- Commands run and results. A green build alone is not validation. -->

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- [ ] `pnpm test:e2e` (if UI or API behavior changed)
- [ ] docs/TEST_REPORT.md updated for new or changed features

## Data and integration impact

- [ ] Synthetic data used; no customer or staff records included.
- [ ] Persian RTL layout checked if the interface changed (desktop and phone width).
- [ ] Implemented integrations distinguished from planned work.
- [ ] Schema change has a migration, a down script and a DATABASE.md entry (or: no schema change).
- [ ] Permissions enforced in the API, not only hidden in the UI (or: no permission change).
- [ ] No secrets, server addresses or real data in code, logs, screenshots or this description.
