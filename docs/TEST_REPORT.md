# Test report

Last full run: **2026-11-01**, branch `feature/qc-delivery` (issue #12 on top of `feature/parts-finance`), Windows 10 / Node 26.8 locally (CI targets Node 22 on Ubuntu). All data synthetic.

## Summary

| Suite | Command | Result |
| --- | --- | --- |
| Lint (ESLint on API, tsc on shared/web) | `pnpm lint` | ✅ pass |
| Typecheck | `pnpm typecheck` | ✅ pass |
| Shared unit tests (Jalali, digits, plates, phones, RBAC, schemas) | `pnpm --filter @manage/shared test` | ✅ 9 / 9 |
| API unit + integration (Jest + supertest, real HTTP, embedded PostgreSQL) | `pnpm --filter @manage/api test` | ✅ 56 / 56 (6 suites; new `qc-delivery` suite with 4 tests, delivery test in `accident` updated to the new gates) |
| Production build (API + web) | `pnpm build` | ✅ pass |
| E2E (Playwright, desktop 1366×860 + Pixel 7) | `pnpm test:e2e` | ✅ 8 / 8 locally on Edge in three consecutive runs (incl. QC/settlement/handover flow; 2 documentation-screenshot tests skipped by design); ✅ on CI Chromium (PR #20, run 41294515754) |
| Dependency audit (prod, high) + gitleaks secret scan | `pnpm audit`, CI `security` | ✅ no known vulnerabilities; no secrets found. Dependency review is non-blocking until the repo's Dependency graph is enabled (#4) |
| `pnpm dev` from an empty database | manual | ✅ API healthy, demo auto-seeded, web proxy 200 |
| Local Preview `pnpm preview` | manual smoke | ✅ production build on :3100, login via web proxy 200, dashboard counts (5 active, 2 blocked, 1 awaiting authorization, 1 overdue part, 1 part to order, 1 pending finance), sample .xlsx served; restart without `--reset` keeps data and accounts |
| Migrations + seed + audit trigger + demo reset on PostgreSQL 16 | CI job `postgres` | ✅ pass (run 41276167117; with migration `0002_assessments` and the new demo seed: run 41279034901; with `0003_parts_finance`: run 41284274194; with `0004_qc_delivery`: run 41294515754) |
| Docker images + compose smoke test (health via web proxy, login, dashboard) | CI job `docker` | ✅ pass (run 41276167117). Not verifiable on the dev machine: 8 GB RAM, 5.6 GB free disk, Docker daemon crashed twice during builds |

## Acceptance scenarios (brief §11)

| # | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Create a case and search it | ✅ | API: "creates a case … finds it by plate, VIN, name, phone and number"; E2E: supervisor flow ends with plate search |
| 2 | Golden card with official deadline, waiting for company part | ✅ | API "acceptance 2": part from the authorized line, gate open (no customer share), order with ETA, blocker on the activity names the part, ETA moved (first ETA kept), receipt, handover resolves the blocker and returns the activity to work, official deadline unchanged, "not arrived" after handover refused; wrong part rejected at receipt and re-ordered |
| 3 | Body insurance with price change and assessor approval | ✅ | API "acceptance 3": purchase above the approved price refused without assessor name + approval reference, accepted with them (stored); a line re-priced by a pending supplement cannot be ordered until the insurer's decision is recorded |
| 4 | Personal case with advance payment and customer approval | ✅ | API: customer authorization in person, gate "no estimate" → "advance missing"; expert proposes, expert cannot approve (403), cashier cannot confirm before approval, manager approves, cashier confirms → gate open, order recorded with basis "advance paid". E2E: manager → cashier → parts clerk in the browser on demo case 3 |
| 5 | Supplement after hidden damage | ✅ | API "acceptance 5": in-repair case, supplement with discovery time copies approved lines, new line + re-priced line, finalize → previous version superseded and unchanged (prices, total), delta +34 M Rial, financial re-review flag, forecast moved / official deadline unchanged, «مجوز» blocker from discovery time blocks delivery, partial approval excludes rejected line. E2E: same flow in the browser incl. superseded v1 total |
| 6 | Multiple departments and technicians, parallel and dependent work | ✅ | API: dependencies enforced, parallel start, weighted progress 50 %, cycle rejected; E2E: dependency-aware start button |
| 7 | "Part not arrived" while handover is recorded → reviewable discrepancy | ◐ | API: a "not arrived" blocker naming a handed-over part is refused with a discrepancy message. Review queue for the manager: issue #11 |
| 8 | Block costly purchase without financial approval, allow no-cost work | ✅ | API: purchase refused (`FINANCE_GATE`) while stock check, reservation and starting an activity succeed; a supplement raising the estimate closes the gate ("re-approval required"); exception with limit: proposer cannot approve, purchase within limit allowed, beyond limit refused, spending tracked |
| 9 | QC, corrective work, settlement, delivery | ✅ | API "acceptance 9": QC refused before all work is approved; technical close refused with reasons (approved line without installed part, QC missing); checklist rules (failed item needs description + unit, safety item cannot be skipped, all items required); failed round → corrective activity in the chosen unit, case back in repair; round 2 passes after the corrective work → technical close → "آماده تحویل"; handover refused until the financial close; balance due blocks the close, overpayment refused, cashier records the settlement, financial close; handover needs the recipient's confirmation, then delivered + archived (read-only, only under "all"), history has every step. A reopened activity invalidates the technical close (handover refused, stale QC → new round, close again); a changed customer share invalidates the financial close; closing with a balance due only by the service manager with a reason; role checks. E2E: demo case 5 — QC history and corrective activity, cashier settlement + financial close, expert handover → archived |
| 10 | Roles and denial of unauthorized access | ✅ | API: unauthenticated 401, CSRF 403, support roles 403 on create/tasks, expert cannot block activities, admin cannot read cases, masked phone, tenant isolation 404, lockout; E2E: parts clerk read-only view |
| 11 | Old vehicles with past admission date | ✅ | API: past admission + current stage + overdue/legacy filters; E2E: legacy entry form |
| 12 | Reports and correct Persian PDF | ○ | Issue #13. Print view exists; PDF not yet |
| 13 | Offline / sync / backup / restore | ○ | Design only (docs/OFFLINE_SYNC.md); needs server (issues #7, #15) |

✅ automated and passing · ◐ partly covered · ○ not built yet

## Other verified behaviour

- Audit rows cannot be updated or deleted, even with direct SQL (trigger); demo reset deletes only `is_test` tenants.
- Every change writes a change-log entry in the same transaction.
- Repeated `Idempotency-Key` replays the stored response instead of creating a duplicate case.
- Stale `expectedVersion` returns `409 VERSION_CONFLICT`.
- Dashboard card counts equal the totals of the lists they link to (all 7 flags).
- Demo seed creates 5 realistic cases through the real services (stages, overdue, blocker, ready, legacy); case 5 reaches "آماده تحویل" through two QC rounds (one failed with corrective work) and the technical close.
- The stage selector refuses "تحویل‌شده" (`DELIVERY_GATE`) and "آماده تحویل" (`TECHNICAL_CLOSE_REQUIRED`) even with all work approved.
- Phone width: no horizontal scrolling on dashboard and case list; menu opens.

## Assessment and supplements (issue #8)

API tests (`apps/api/test/assessment.e2e-spec.ts`, real HTTP on embedded PostgreSQL):

- Initial assessment: draft totals, stale `expectedVersion` → 409, empty finalize rejected, finalize → «مجوز» blocker + stage "در انتظار مجوز / تأیید", final lines immutable (`ASSESSMENT_FINAL`), manual resolve of the waiting blocker rejected (`BLOCKER_MANAGED`), insurer approval without official reference → 400, with reference → approved and blocker resolved, second decision rejected.
- Decision recorded afterwards is accepted; a decision older than the assessment is rejected; the wait starts at the assessment time.
- Only one initial assessment and one draft per case; no supplement before a final assessment.
- RBAC: parts clerk can read but not create (403).
- Acceptance 5 (above) and a supplement that only removes a line (no new authorization, negative delta, no blocker).

Demo seed test: demo case 1 now carries an approved assessment and a supplement waiting for authorization (blocked cases 1 → 2).

## Parts and financial gate (issues #9, #10)

API tests (`apps/api/test/parts-finance.e2e-spec.ts`): acceptance 2, 3, 4, 8 (above); payer shares for a mixed case (blocked until recorded, stale version → 409); Excel import (preview with per-row errors, file with errors imports nothing, valid file imports all rows, non-.xlsx rejected); permissions (cashier cannot create parts, expert cannot run part steps, parts clerk cannot propose finance); dashboard counts equal the new case-list filters.

E2E (`apps/web/e2e/parts-finance.spec.ts`): manager approves the advance, cashier confirms receipt, parts clerk orders (approved price prefilled), receives, hands over to a unit, imports the sample .xlsx (preview → 4 rows), manager sees the steps in the history.

## Pre-merge review of PRs #16, #17, #18 (2026-11-01)

| Check | Result |
| --- | --- |
| Merge conflicts | None: #16 → main (main has no commits missing from #16), #17 → #16, #18 → #17 |
| Authorization | Every domain endpoint carries `@RequirePermissions`; only login, logout, me and health are outside it (by design). Separation of duties enforced in services |
| Tenant isolation | New queries (assessments, parts, finance) filter by the actor's tenant or by ids already loaded under it |
| Secrets | No credential or key files tracked; no secret literals in code; gitleaks clean |
| Dependencies | `pnpm audit --prod`: no known vulnerabilities (fflate 0.8.3) |
| Session/passwords | httpOnly + SameSite=Lax cookie, Secure behind HTTPS; scrypt with per-user salt, constant-time compare |
| CI | All 5 jobs green on #16, #17 and #18 after the fixes below |

Found and fixed during the review:

| PR | Finding | Fix |
| --- | --- | --- |
| #16 | Web proxy forwarded the client's `X-Forwarded-For` verbatim, so a client reaching Next.js directly could bypass the per-address login rate limit | Forwarded only with `TRUST_PROXY_HEADERS=true` (behind Caddy/Nginx, which overwrite it) |
| #16 | Malformed or oversized JSON answered with a generic code and English text | Stable codes `INVALID_BODY` / `PAYLOAD_TOO_LARGE` with Persian messages (test added) |
| #18 | JSON body limit was the 100 KB default while the import accepts ~1 MB files: real sheets above ~75 KB failed | Limit 2 MB; test with a 1500-row sheet (~270 KB) |
| #18 | An .xlsx is a ZIP: a small upload could expand to gigabytes in memory | Only needed parts inflated; declared sizes capped (16 MB per entry, 32 MB total); decompression-bomb test |

## QC, closes and delivery (issue #12)

API tests (`apps/api/test/qc-delivery.e2e-spec.ts`): acceptance 9 end-to-end on a personal case; invalidation of both closes after later changes (golden card); balance-due close (cashier 403, manager without reason 400, manager with reason → accepted amount recorded); permissions (expert / parts clerk cannot record QC, QC inspector cannot close or hand over, expert cannot close financially, cashier cannot hand over; QC inspector reads the completion state).

E2E (`apps/web/e2e/qc-delivery.spec.ts`, demo case 5): QC inspector sees two rounds and the corrective activity, no handover button; cashier sees the balance blocking the close, records the settlement (balance prefilled), closes financially; expert hands over (submit disabled until the recipient's confirmation) → "تحویل‌شده", archived, no edit link. Screenshots of the panel and the QC form (desktop and phone) reviewed: `docs/screenshots/*-completion-demo.png`, `*-qc-form.png`.

CI (PR #20, run 41294515754): all 5 jobs green, incl. migration `0004_qc_delivery` + demo seed on PostgreSQL 16 and the Docker smoke test. Not covered yet: no printable delivery form or invoice (issue #13 / finance module).

## Defects found by tests and fixed

| Found by | Defect | Fix |
| --- | --- | --- |
| E2E | Resolving a blocker in the same minute it was recorded failed: the date field re-parsed the time at minute precision on blur, earlier than the exact creation time | Input keeps the precise value when its text is unchanged; API accepts minute precision for ordering checks (regression test added) |
| E2E (intermittent) | After committing the date, the time field could be reset while the user was typing, saving 00:00 | Input re-syncs only on external value changes |
| E2E | Search tests clicked the first row before the debounced search applied | Tests wait for the URL query and row count |
| Startup log | Express 5 rejected the logger's bare `*` route | Named wildcard |
| Audit | High-severity advisories in drizzle-orm and multer | Upgrade / override |
| Screenshot review | Signed delta "+25,000,000" rendered with the sign on the wrong side in RTL | Shown as «افزایش/کاهش …» |
| Screenshot review (phone) | Assessment line table cramped, status column off-screen | Lines become stacked cards under 860 px |
| Writing the demo seed | Authorization recorded afterwards was rejected because it predated finalization in Manage | Lower bound is the assessment time; regression test added |
| `pnpm audit` | fflate 0.8.2 (Excel import) can loop forever on a malformed ZIP64 upload (GHSA-px8p-9vwx-vf98) | Pinned fflate 0.8.3 |
| E2E (full suite) | Several role logins within a minute hit the login rate limit (10/min) | `LOGIN_RATE_LIMIT` setting; default unchanged, E2E uses 200 |
| E2E (3rd run, intermittent) | After clearing cookies, the old page's background 401 redirect aborted the next navigation | Test leaves the page before switching user |
| Screenshot review | History showed the authorization source as "part source" and numbers in Latin digits | Labels per event type, Persian digits |
| API test (issue #12) | Work re-approved within a minute of a QC round was not detected as "QC stale" (minute tolerance on backdatable times) | Stale when any activity changed after the round was recorded (application clock) |
| API test (issue #12) | A technical close made before reopened work counted as valid again after a new QC round, without the supervisor closing again | Close is valid only if made after the latest QC round |
| Screenshot spec | Button "رد" also matched «… موضوعیت ندارد» | Exact match |

## E2E consecutive runs (flakiness check)

After the date-input fix, on 2026-11-01 (desktop + mobile projects, Edge):

| Run | Result | Duration |
| --- | --- | --- |
| 1 | 5 passed | 54.8 s |
| 2 | 5 passed | 1.0 min |
| 3 | 5 passed | 57.8 s |

With the assessment flow (branch `feature/assessment-parts`, 2026-11-01): 6 passed in 38.5 s, 39.3 s and 39.8 s.

With parts and finance (branch `feature/parts-finance`, 2026-11-01, after the two E2E fixes above): 7 passed in 49.6 s, 48.7 s and 49.1 s.

With QC and delivery (branch `feature/qc-delivery`, 2026-11-01): 8 passed in 1.1 min, 1.2 min and 1.4 min (desktop + mobile, Edge).

## Live isolated Preview verification — 2026-11-01

See [deployment record](PREVIEW_DEPLOYMENT_20261101.md) for checks actually run, application SHA, limitations and recovery. HTTPS, password gate, PostgreSQL health, manager login, Secure/HttpOnly cookie, synthetic dashboard, port isolation and effective SSH policy passed. Both images rebuilt successfully. Modified setup script passed bash syntax and ShellCheck. Browser E2E on this host was not run; application CI passed on the deployed SHA.

## Browser compatibility follow-up — 2026-11-01

The in-app browser rejected the native Basic authentication challenge with ERR_INVALID_AUTH_CREDENTIALS. The Preview now uses the additional `docker-compose.form-gate.yml` overlay: Caddy proxies through an internal, non-root Node gate. Unauthenticated page requests redirect to a Persian HTML sign-in form; API requests receive 401 without a browser challenge. The same existing Preview password is retained, stored as a salted scrypt digest. Successful sign-in sets a signed, expiring, Secure/HttpOnly/SameSite=Strict host-only cookie. The gate checks login Origin, limits attempts and request size, and does not publish an additional host port. The old Basic header remains supported for smoke-test clients without a WWW-Authenticate challenge.

`setup-server.sh` configures form-gate secrets without printing them. `deploy.sh` includes the form overlay when PREVIEW_GATE_HASH exists in `.env`. Always include all three Compose files on this VM; using only the original two would restore the legacy browser challenge. No password, domain, DNS or production resource changed.

Verification: Node integration tests passed locally and in the Node 22 container (valid/invalid login, Origin rejection, rate limiting, Secure/HttpOnly cookie, tampered/expired token rejection and upstream credential stripping); shell syntax and ShellCheck passed. The actual in-app browser completed both login steps and displayed the manager dashboard with five synthetic cases. Screenshot evidence and access details were delivered privately to the owner. Earlier statements about anonymous `/login` returning 401 and no host browser test are superseded by this follow-up: anonymous pages now redirect, and in-app browser login was verified.
## Personal Authenticator authentication — 2026-11-01

Scope: isolated Manage Preview only. The final owner choice supersedes the earlier SMTP plan: email is an identifier, password is personal, and the second factor is Google Authenticator. Invitations are private links shared manually. No mail was sent and no Gmail setting was changed.

Validation in a disposable Node 22 staging container on the Manage VM (separate checkout, no live DB): full lint/typecheck, shared/API suite and API/web build passed before the last tenant-isolation assertion and UI contract additions. Final targeted API typecheck and `personal-auth.e2e-spec.ts`: **5/5 passed**, including RFC 6238, encrypted-seed tampering, role checks, no idempotency-secret cache, pending-account protection, activation, secure session issuance, replay rejection, concurrent verification, expired invites, attempts and cross-tenant conflict/isolation. `pnpm audit --prod --audit-level=high`: no known vulnerabilities. Local Node gate integration tests passed, including rejection of old shared cookies and password-only sessions in personal mode.

Two added Playwright tests exercise Persian personal-login and QR-enrollment UI using explicitly mocked synthetic challenge responses; they do not claim real MFA end-to-end coverage. CI execution is pending. Live rollout and the owner's own password/QR enrollment are pending. Automatic password/factor recovery and backup codes are not implemented.

## Live Preview after QC and delivery — 2026-11-01

Deployed SHA `88e1f6d` (merge of PR #20 into the Preview branch). 49/49 live checks over HTTPS through the form gate (gate, 6 role logins, dashboard, the five demo cases, full case flow from creation through finance gate, parts, QC with corrective work, both closes and handover) and a real-browser check on desktop and phone passed. Details: [deployment record](PREVIEW_DEPLOYMENT_20261101.md).

CI follow-up: secret scan identified only the public RFC 6238 Appendix B vector in the synthetic test, not an application credential. `.gitleaksignore` records that exact historical commit/path/rule/line fingerprint, preserving every other secret check. Deployment health checks now accept HTTP 200 for personal-login mode while retaining 401/302 for legacy mode. Current code integrates the already-deployed QC/hand-over changes; personal migration is **0005_personal_auth**, following 0004_qc_delivery. Final CI rerun pending.

Browser CI identified the activation password's helper text as part of its accessible label. Moved the length hint outside the label and associated it with `aria-describedby`, preserving the exact field name and the existing meaningful UI test. Other 9 browser tests passed (2 intentionally skipped). Re-running CI before rollout.

## Personal authentication rollout completed — 2026-11-01

Deployed application SHA: `58ad08c9ccb427de74ce2d2c2f008a29e043b972`, preserving QC/hand-over from the current Preview branch. PR #21 remains draft; no main merge. All **five CI jobs passed** in run [41297169933](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41297169933): lint/typecheck/build, shared 9, API 61, Playwright **10 passed / 2 intentionally skipped**, PostgreSQL 16 migration/seed/reset and Docker/HTTPS/gate smoke, dependency audit and secret scan. The two new UI tests use mocked challenges; the API suite verifies actual TOTP and session logic.

On the isolated Manage VM only: private DB/config backup verified with pg_restore listing; existing deployment preserved before update; web/API images built; additive migration **0005_personal_auth** applied. AUTH_TOKEN_SECRET was generated once on-server and saved only in mode-600 configuration/private backups. API and gate use the same personal-mode flag. All application services healthy, trusted HTTPS `/login` 200, auth/options true, anonymous dashboard API 401 and private cases 302, legacy demo/password endpoint 403. No shared site password can satisfy the personal gate. NTP synchronized.

Owner invitation was written privately for the owner-confirmed email; the actual in-app browser displayed the empty personal-password activation form. No real owner password was entered and no real owner QR was generated/viewed by the agent. **Owner activation and first personal login remain pending the owner's own actions.** No email was sent, Google account changed, Source/Production accessed, DNS changed, paid resource created, or customer data imported. Private invitation and configuration are not in Git. Subsequent documentation-only commits do not change the deployed application SHA.

## Repository documentation audit — 2026-11-01

No application/runtime/schema changes. Base 82152c2 has all five jobs successful in [run 41297553236](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41297553236). Added a dependency-free documentation check for local Markdown links and the API controller route inventory; local result and final PR CI are recorded in the PR. Original full application suites run in CI on this documentation PR.

Read-only evidence: primary platform and prior Preview checkout clean; deployed 58ad08c clean; prototype tooling/docs preserved separately in PR #22. Prototype synthetic npm test passed locally on Node 26.8.2 and in Windows/Node 22 CI [41307696880](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41307696880). Browser tests were not rerun and their historical autosync expectation failure remains documented. Owner confirms their own successful personal login; it is not claimed as an agent-run MFA test.

Local documentation validation passed: 26 Markdown files, 49 controller routes, `node --check scripts/check-docs.mjs` and `git diff --check`. No application dependencies, customer data or private runtime configuration are needed for this check.

## Staff invitation email — 2026-11-01

Local lint/build passed. Shared 9/9, API 68/68 (including seven new invitation/transport tests) passed; production dependency audit reports no known vulnerabilities. Coverage: RBAC/readiness, no pending account on missing SMTP config, per-invitation delivery and sanitized audit, no token in response/cache/audit, send failure and explicit resend without duplicate identity, active-user protection, password/QR setup and real synthetic TOTP login; SMTP HTML escaping, TLS/STARTTLS and refusal handling. Transport tests mock the sender; they do not claim real Gmail delivery.

Browser checks: **3/3 passed locally on Edge**, covering owner form, explicit resend with exactly the invitation fields, no link-copy required for email, responsive 390px layout with no horizontal overflow, failed/unconfigured states and the optional private-link fallback. The third test uses the real API to create an invitation with a synthetic test-only signing key while email is unavailable. Desktop/mobile screenshots inspected; email UI results are mocked, not live Gmail. Documentation check: 27 Markdown files / 51 controller routes passed. The owner-approved integrated main eaa7c66 passed all six jobs in [41318062293](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41318062293). PR #24's initial aeb76a4 passed all six jobs in [41319910328](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41319910328); the private-link follow-up has its own CI. Private sender configuration and feature rollout remain separate verification steps; final CI is recorded in the PR.

### Approved staff rollout result

Final feature b7e4c93 passed all six jobs in [41320401502](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41320401502); main merge 2b1bf10 passed [41320771320](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41320771320). Image export CI [41321155189](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41321155189) also passed all six jobs. The staff app is deployed with verified archive checksum/source/image IDs, private backup archive listing, migration columns, healthy services, login HTTPS 200, TOTP enabled and anonymous invitations API 401. Config was unchanged byte-for-byte; no data reset. No authenticated owner/staff action was performed on the live app. Actual local Gmail authentication and an explicitly approved local self-test succeeded; VM SMTP connections timed out and are tracked in #26. See [release evidence](STAFF_PREVIEW_DEPLOYMENT_20261101.md).
