# Contributing

Read [AGENTS.md](AGENTS.md) first — it holds the non-negotiable rules (approvals, data, secrets, Source by HEDAX isolation).

## Workflow

1. Pick or open an issue with acceptance criteria. Board columns: Backlog → Ready → In Progress → Review → Testing → Done (`status:` labels).
2. Until the platform stack is merged, branch platform work from its latest reviewed head and record the dependency (see [audit](docs/GITHUB_AUDIT.md)); after integration, branch from `main`: `feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
3. Keep PRs small and reviewable; fill in the PR template.
4. Documentation-only work: `node scripts/check-docs.mjs`. For application changes before pushing: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:e2e` when behaviour changed.
5. Update [docs/TEST_REPORT.md](docs/TEST_REPORT.md), [CHANGELOG.md](CHANGELOG.md) and [PROGRESS.md](PROGRESS.md).
6. Merge to `main` only after review and explicit owner approval.

## Commit messages

Conventional style: `feat(api): …`, `fix(web): …`, `docs: …`, `test: …`, `chore: …`. Explain why, not only what.

## Code

- Shared contracts (enums, labels, permissions, zod schemas) live in `packages/shared`; API and web both import them.
- One transaction per command, with `AuditService.record()` inside it.
- Persian UI copy: plain, active voice, sentence-style; a button says what it does ("ثبت مانع", not "تأیید"); errors say what happened and how to fix it.
- Test data must be obviously synthetic (phones `0900…`, VINs `TESTVIN…`).
