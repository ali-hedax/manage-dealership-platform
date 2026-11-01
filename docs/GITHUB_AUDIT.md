# GitHub audit — 2026-10-31

Repository: `ali-hedax/manage-dealership-platform` (**public**, default branch `main`, admin access verified with `gh`). Nothing was deleted, closed or merged during this audit.

## Before this work

- `main` (a52de7d): single-file prototype `index (4).html` (inventory, parts ordering, roadside, admission-to-release analytics), bilingual README, PR template. No CI, no tests on `main`, no branch protection, no issues, no releases, no Actions runs, 10 default labels.
- Local working copy: empty folder (fresh clone).

## Branches

| Branch | vs main | Content | Classification |
| --- | --- | --- | --- |
| `feature/b2b-auto-report` | +12 / −1 | Prototype extensions: B2B report companion, reception analytics, Manage brand assets (`assets/brand/manage/`), 15 test files, `IMPLEMENTATION_STATUS.md` | **Remaining — needs owner review.** Not merged anywhere. Brand assets were reused (copied) by the new web app. |
| `feature/nobat-dahi` | +1 / −1 | "Appointments and repair schedule" import for the prototype (PR #1) | **Needs review** (prototype scope) |
| `chore/rename-index-html` | +1 / 0 | Rename `index (4).html` → `index.html` (PR #3, draft) | **Needs review**; conflicts with the two branches above (their tests reference the old name) |
| `docs/github-professional-20261012` | merged via PR #2 | README + PR template | **Merged** |
| `feature/accident-mvp` | new | Manage platform: monorepo, API, web, tests, CI, docs | **This PR — needs review** |

## Pull requests

| PR | State | Classification | Recommendation |
| --- | --- | --- | --- |
| #1 nobat-dahi | Open | Needs review | Decide whether the prototype keeps evolving. The new platform will cover scheduling as a module; if the prototype is retired, close with a note (owner decision). |
| #2 docs | Merged | Merged | — |
| #3 rename index | Draft | Needs review | Merge only together with updates to #1 and `feature/b2b-auto-report`, or leave the name as is while the prototype is frozen. |

## Changes made in this work (on `feature/accident-mvp` only)

- New monorepo alongside the prototype; `index (4).html` untouched.
- README/README.en rewritten for the new product, with a section on the prototype.
- CI workflow, issue templates, extended PR template, documentation set.
- Labels, milestones and issues created through the GitHub API (see PROGRESS.md).

## Requires owner decision

1. Merge `feature/accident-mvp` into `main`.
2. Branch protection on `main` (required checks: `check`, `postgres`, `e2e`, `security`; 1 review). Available on public repositories; not enabled without approval.
3. Future of the prototype branches/PRs (#1, #3, `feature/b2b-auto-report`).
4. Repository visibility: the repo is public. Business logic and docs are visible to everyone; no customer data or secrets are in it. Consider making it private before real operational details are documented.
5. License type (currently none — all rights reserved).
