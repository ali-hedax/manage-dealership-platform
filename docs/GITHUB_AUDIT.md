# Repository audit — 2026-11-01

## Update 2026-11-05 — main is the single base

With explicit owner approval, PR #49 merged the published platform (#28–#48, release `79f6585`) and staff recovery (#47) into main (`1be462f`). The stacked PRs #30 and #32–#48 and the superseded #25 and #27 were then closed with a pointer to #49, and the branches below were deleted. Every commit of a merged branch is reachable from main; a deleted branch can be restored from its closed PR page or with `git push origin <sha>:refs/heads/<name>`.

| Branch | Last commit | Reason |
| --- | --- | --- |
| `chore/production-domain-managebyhedax` | `549c763b4e5263c2ad03a78ee56a4dd641d8ae11` | merged into main |
| `docs/readme-refresh` | `87a0853481c0efaa6ab8de035d8de395e31c18f9` | merged into main |
| `docs/repository-audit-20261101` | `e21b64690b8204237cdbd6169fb8b03b33a784a3` | merged into main |
| `feature/accident-mvp` | `0269e5ce710b4d3416a2499b7a570a592423210d` | merged into main |
| `feature/accident-workflow-redesign` | `5681ddab9998db69e501a3f3d8724717ac0e3125` | merged into main |
| `feature/assessment-intake-simplification` | `2af7fcf56484dbd5af4f95afe255be1d196df9ae` | merged into main |
| `feature/assessment-parts` | `b61de9b466c0fb1e2e53986b6c2d24736ace1bd7` | merged into main |
| `feature/assessment-parts-dispatch` | `65284510bbbb9ce8a8d6249eeb7aec7ea04ef09b` | merged into main |
| `feature/daily-parts-reports` | `9b07cb0816a92e49db2a0755042866577eec601e` | merged into main |
| `feature/department-workspaces` | `ac77e02d8119079d95784ad615b4768e78b1672c` | merged into main |
| `feature/entry-workbench-refresh` | `475a8979130221856599c1cfbea61851abe78302` | merged into main |
| `feature/login-redesign` | `ab53f74865d3e47c9d18d5fb2fa4ebf231eeed2c` | merged into main |
| `feature/online-pwa` | `11502044738513f3cd04cb13a3574017f2691b79` | merged into main |
| `feature/parts-finance` | `c4c2ae68a91344546c1a3be64936f6c90ad43657` | merged into main |
| `feature/personal-auth-totp` | `82152c2c9298b5c37c870e618e171592892b3820` | merged into main |
| `feature/preview-deploy` | `e90aae7bd635da68a4aff13bee327c54c446ff1d` | merged into main |
| `feature/qc-delivery` | `17a0b4ce885e517e5ab1404d7897d113762fc447` | merged into main |
| `feature/reference-data` | `43ca48209d8942b7edac91d595841aed05e6d343` | merged into main |
| `feature/reports-center` | `8ec36cdf04ba8e4c069857259c52f71064adbac2` | merged into main |
| `feature/staff-access-recovery` | `474d99ed5d366c369560c54b25a60c8ff8c1e6dc` | merged into main |
| `feature/staff-email-invitations` | `b7e4c93d5e29053019e359c34a53691d649642f2` | merged into main |
| `feature/ui-polish` | `346ad91f17b6948171f6bd0c4015da43a4a4d017` | merged into main |
| `feature/ui-states` | `701f02c08373a20193b1459fe6b60be403633387` | merged into main |
| `feature/vehicle-excel-import` | `24714efcd9d67dcbb44803a887e3944c8b1ef420` | merged into main |
| `fix/invitation-email-delivery` | `8290a8c0296b96f836420129a0999d9fec16a82f` | merged into main |
| `fix/short-case-vehicle-label` | `67157c317229146797531536315b39b037468920` | merged into main |
| `fix/system-admin-workbench` | `db5ce5b03e256110b81a651801b968a2dd81abe5` | merged into main |
| `release/integrate-20261105` | `e0f9e99b14e91ce03ef4109c807a9ee7765bf2f4` | merged into main |
| `build/preview-images-pr28` | `8bd0d0aebc99b7936903811e23f2f9bd17d1b8a0` | superseded: build-only (#29, closed earlier) |
| `build/preview-images-pr30` | `4f32b47b27a2c5ada62e00a03bc0d7539ca0f8ab` | superseded: build-only (#31, closed earlier) |
| `fix/preview-image-artifacts` | `0e9bb59bda057fcbf6722a8f5d68f6eff4c7ce20` | superseded: #25, image export already in main CI |
| `docs/staff-preview-release-record` | `76df0b3810ad1a0d17c3059b95f9fa5ea9685ca1` | superseded: #27, its new record file copied into main |

Kept on purpose (legacy prototype lineage, AGENTS.md): `feature/nobat-dahi` (#1), `chore/rename-index-html` (#3), `feature/b2b-auto-report`, `chore/preserve-local-prototype-20261101` (#22), `docs/github-professional-20261012`.

---

Repository: [ali-hedax/manage-dealership-platform](https://github.com/ali-hedax/manage-dealership-platform). Public; default branch main; connected GitHub account has admin/push access. No merge, deletion, branch-protection, server/configuration, DNS or Production change was performed during this audit. Source by HEDAX was not accessed.

## Branch and pull-request snapshot

All six platform PRs below are open drafts. Their five latest checks passed on the listed head commits. A green check is validation, not merge approval.

| PR | Head branch / SHA | Base | Latest CI run |
| --- | --- | --- | --- |
| [#16](https://github.com/ali-hedax/manage-dealership-platform/pull/16) | feature/accident-mvp / 0269e5c | main | [41286271908](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41286271908) |
| [#17](https://github.com/ali-hedax/manage-dealership-platform/pull/17) | feature/assessment-parts / b61de9b | feature/accident-mvp | [41286275151](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41286275151) |
| [#18](https://github.com/ali-hedax/manage-dealership-platform/pull/18) | feature/parts-finance / c4c2ae6 | feature/assessment-parts | [41287424497](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41287424497) |
| [#20](https://github.com/ali-hedax/manage-dealership-platform/pull/20) | feature/qc-delivery / 17a0b4c | feature/parts-finance | [41294805906](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41294805906) |
| [#19](https://github.com/ali-hedax/manage-dealership-platform/pull/19) | feature/preview-deploy / e90aae7 | feature/parts-finance | [41296408969](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41296408969) |
| [#21](https://github.com/ali-hedax/manage-dealership-platform/pull/21) | feature/personal-auth-totp / 82152c2 | feature/preview-deploy | [41297553236](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41297553236) |

There are six existing platform PRs (#16–#21); the documentation PR from this audit is the seventh. PR #19 already contains the QC branch through merge commit 88e1f6d. PR #21 contains that Preview history. Proposed owner-approved integration order: #16 → #17 → #18 → #20 → #19 → #21 → documentation. Re-evaluate diffs and CI and retarget dependent bases after each integration; never blindly squash every stacked diff or merge them all automatically. Historical PR #20 text saying it is not deployed and #21 text saying owner enrollment is pending are superseded by the deployment records and the owner's current report.

Other history: main is a52de7d (merged documentation PR #2). PR #1 remains open and reports merge conflicts; PR #3 is draft, no checks. The appointment branch and b2b-auto-report branch remain separate prototype work; the rename proposed by #3 would require companion/test/launcher reference updates. No old PR was closed or branch deleted. docs/github-professional-20261012 remains preserved after #2.

## Local and server evidence

| Location actually inspected | Result | Handling |
| --- | --- | --- |
| Desktop platform checkout (ali ai 4 manage) | feature/preview-deploy at e90aae7; clean, no local-only commits after fetch | Left unchanged; isolated worktrees used for this audit |
| Prior Preview chat's work/manage-preview checkout | feature/personal-auth-totp at 82152c2; clean | Same committed personal-auth code as GitHub |
| Manage VM /opt/manage, using the dedicated Manage key | Detached 58ad08c9ccb427de74ce2d2c2f008a29e043b972; clean including untracked paths; API/web/gate/DB healthy | Read-only Git/container-status inspection; no reset, deploy, secret/database read or data export |
| Desktop prototype checkout (ali ai2) | feature/b2b-auto-report at e55ba16; 12 staged modified/new files and untracked AGENTS.md | 13 explicit safe source/config/documentation paths copied byte-for-byte into a separate preservation branch; original index and files retained |

The preserved paths are .editorconfig, .env.example, .gitattributes, .github/workflows/test.yml, .gitignore, the four .vscode JSON files, CLAUDE.md, README.md, package.json and AGENTS.md. No .local, real .env, database, report archive, browser profile, invitation or credentials file was copied. Other chat exports contain private runtime material and are not publication sources. No claim is made about unsaved editor buffers, browser IndexedDB or inaccessible machines/sessions. A later change can happen after this snapshot.

Preservation is published as draft [PR #22](https://github.com/ali-hedax/manage-dealership-platform/pull/22), base feature/b2b-auto-report: original snapshot e152981 and documentation follow-up 165ad5b. Windows/Node 22 synthetic CI passed for 165ad5b in [41307696880](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41307696880). The original local staging remains unchanged. Do not merge the prototype root configuration into the platform stack.

The owner reports completing their own personal login. That is recorded as owner confirmation, not an agent inspection of the password, QR, account data or session.

## Repository organization and limits

- 27 labels and four existing delivery milestones were inspected; existing taxonomy is retained. Issues #5/#8/#9/#10/#12 and implemented PRs were moved to status: review with appropriate delivery milestones; #14 is in progress because password/factor recovery and account administration are incomplete. #1/#3 are marked as owner decisions. No item was closed or marked done. Repository description/topics now identify the TypeScript platform and preserved legacy prototype. Open does not mean unimplemented.
- The current CLI token cannot list/manage Projects v2: missing read:project (write operations also need project). The classic Projects endpoint returns 404. No Project was created or claimed complete. Continue with [repository issue filters](GITHUB_WORKFLOW.md) until the owner enables project access.
- main has no branch protection. Dependency graph/review is not fully enabled; CI dependency review is explicitly advisory while production dependency audit and gitleaks are blocking. Branch protection/security settings, visibility and license remain owner decisions in issue #4.
- This documentation branch descends from #21 and adds API route/link checks to CI. It does not alter the application, migrations or runtime configuration. The default-branch README stays old until an approved merge.

## Follow-up

Review the documentation and prototype-preservation PRs; authorize merges separately. Keep #1/#3/b2b history until feature-parity decisions. See [migration plan](PROTOTYPE_MIGRATION.md), [workflow](GITHUB_WORKFLOW.md), [progress](../PROGRESS.md) and [tests](TEST_REPORT.md).

## Approved platform integration — 2026-11-01

The owner explicitly approved “merge in main; continue with Preview” in the current chat. PRs #16, #17, #18, #20, #19, #21 and #23 were merged in that order using merge commits and expected-head checks. Before each merge, git merge-tree proved that the result equals the previously CI-tested head tree. main is now eaa7c66be5cb78308ef52fd4e4b4afd61be84bb0, with all six jobs passed in [41318062293](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41318062293). No branches were deleted; #1/#3/#22 remain separate. No server or Production operation accompanied these merges. Earlier “main is legacy / unmerged” statements above are the historical audit snapshot.

Staff email invitations are implemented next on feature/staff-email-invitations, branched from the integrated main. New feature merge and Preview rollout are tracked separately from the already-approved platform integration.
