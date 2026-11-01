# Repository audit — 2026-11-01

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
