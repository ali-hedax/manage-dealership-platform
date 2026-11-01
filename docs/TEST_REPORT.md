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
| E2E (Playwright, desktop 1366×860 + Pixel 7) | `pnpm test:e2e` | ✅ 8 / 8 locally on Edge in three consecutive runs (incl. QC/settlement/handover flow; 2 documentation-screenshot tests skipped by design); CI: see PR of `feature/qc-delivery` |
| Dependency audit (prod, high) + gitleaks secret scan | `pnpm audit`, CI `security` | ✅ no known vulnerabilities; no secrets found. Dependency review is non-blocking until the repo's Dependency graph is enabled (#4) |
| `pnpm dev` from an empty database | manual | ✅ API healthy, demo auto-seeded, web proxy 200 |
| Local Preview `pnpm preview` | manual smoke | ✅ production build on :3100, login via web proxy 200, dashboard counts (5 active, 2 blocked, 1 awaiting authorization, 1 overdue part, 1 part to order, 1 pending finance), sample .xlsx served; restart without `--reset` keeps data and accounts |
| Migrations + seed + audit trigger + demo reset on PostgreSQL 16 | CI job `postgres` | ✅ pass (run 41276167117; with migration `0002_assessments` and the new demo seed: run 41279034901; with `0003_parts_finance`: run 41284274194) |
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

## QC, closes and delivery (issue #12)

API tests (`apps/api/test/qc-delivery.e2e-spec.ts`): acceptance 9 end-to-end on a personal case; invalidation of both closes after later changes (golden card); balance-due close (cashier 403, manager without reason 400, manager with reason → accepted amount recorded); permissions (expert / parts clerk cannot record QC, QC inspector cannot close or hand over, expert cannot close financially, cashier cannot hand over; QC inspector reads the completion state).

E2E (`apps/web/e2e/qc-delivery.spec.ts`, demo case 5): QC inspector sees two rounds and the corrective activity, no handover button; cashier sees the balance blocking the close, records the settlement (balance prefilled), closes financially; expert hands over (submit disabled until the recipient's confirmation) → "تحویل‌شده", archived, no edit link. Screenshots of the panel and the QC form (desktop and phone) reviewed: `docs/screenshots/*-completion-demo.png`, `*-qc-form.png`.

Not covered yet: migration `0004_qc_delivery` on PostgreSQL 16 and the Docker smoke test run in CI only (dev machine limits); no printable delivery form or invoice (issue #13 / finance module).

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
