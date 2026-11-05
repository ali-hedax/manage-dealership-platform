# Assessment dispatch and working-day repair plans — 2026-11-05

Application/test commit `79f658515e94e9138453002c7a6edd8a4b960530`, [PR #48](https://github.com/ali-hedax/manage-dealership-platform/pull/48), published manually under the owner's continuing instruction to finish and publish this work without another permission request. No merge to main. Production source f2a3758 and the entry-workbench changes through 475a897 were incorporated; the existing domain, Arvan proxy, private operations and authentication configuration were preserved.

## Delivered behavior

- Select individual/all replacement lines and send them to parts from the current assessment. Initial assessments and supplements need no generic authorization wait. Exact-code/origin reconciliation prevents repeated requests from complete supplement files; quantity increases send only the difference. Reductions, duplicate current codes and changes to already requested codes require review, preserving supply history.
- Outside-market buying still needs the parts quote and the coordinator's recorded price coordination with the payer. Exact price, quantity, supplier and validity checks, payment controls, official decision history and role enforcement remain intact.
- Case intake accepts working days and calculates the forecast using a frozen dealership calendar. Station shares accept working days; dependencies determine sequential starts, parallel intervals count once, and existing task baselines remain unchanged. One day means the longest configured shift-day; Thursday uses its actual shorter hours. Prior case forecasts and official dates are not automatically changed.

## Validation

[CI 42016899492](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/42016899492): all six checks passed. Shared 21/21, API 188 passed with 9 PostgreSQL-only tests skipped in that job; those 9 passed separately on PostgreSQL 16. Browser 35 passed, 2 optional documentation screenshots skipped; isolated daily/support 3/3. Local related API 31/31, synthetic demo 1/1, merged browser 35 passed/2 optional skips, final text checks 3/3, final daily/support 3/3; builds and lint passed.

CI first exposed an obsolete demo expectation for generic authorization, then a browser-test race: `Locator.all()` was used before the new support workspace had rendered. The demo expectation was aligned with the corrected business rule; the test now waits for both disclosure controls before opening them. The final run passed without retries. No production information was used in test fixtures.

## Provenance and preservation

- Artifact `13410460829`, `preview-images-79f658515e94e9138453002c7a6edd8a4b960530`, 108211643 bytes. ZIP SHA256 `d9b8dbb76fd913b910630b31043d4646f7c55a3ec5c708ec24b28922cfa75fd3`; inner archive `304a0c482f7fd46258b3a60e98ef2afbbe2198c0c1a64c4227430590e19639b3`.
- CI source `519a6fae91b1d6a4feb6608a4ef586005475a83b`, tree `ac4a9a18d6e7a0604ef8f62a8c72f004d2f182d5`, equal to the application/test commit's tree.
- Running API image `sha256:fe29807490ccacfa6eb171346e4c3b27a81f7e5550fdf70cb989bbb6bc053be8`; web `sha256:9398c6f5e7d11c43299b8de339baba2f0ae9a57953001fab56b229736927472e`. Exact image IDs matched after startup.
- Preflight backup `operational/20261105T110117Z` restored separately. Migration 0015 adds only nullable `cases.repair_plan`, without backfill. Rehearsal verified every original row by normalizing only this newly added key, all old migration rows unchanged, exactly one expected new migration, and NULL repair plans for every old case. Final exact CI images repeated the migration/read-only rehearsal successfully.
- Frozen pre-install backup `operational/20261105T112039Z`; the same comparison passed on production across migration, before restart. `.env` bytes unchanged; TOTP, one owner and the system administrator's effective 44 permissions preserved. No seed/reset, real assessment dispatch, reservation, purchase, payment, approval or calendar edit was performed for testing.
- Maintenance **11:20:38–11:21:24 UTC**, **14:50:38–14:51:24 Tehran**, **46 seconds**. Production PostgreSQL health, public login/manifest and unauthenticated API 401 passed. Existing Caddy configuration reloaded.
- Read-only owner-session UI confirmed the numeric working-day input, folded optional official dates, single/all assessment selection and dispatch controls, preserved official decision history and the workshop page fitting the phone viewport. The empty intake form was not submitted.
- Final backup `operational/20261105T112238Z` restored separately; every raw table and migration fingerprint matched the stable live database. Both exact scratch databases removed. Recovery archive SHA256 `9830c720928f5daacec0d8e934d25ec40d82b8e1cd822878b8d88bf4716a1f39`.
- Off-server recovery `Documents/Manage Backups/dispatch-recovery-final-79f6585-20261105.dpapi`, 24875926 bytes, encrypted for the owner's Windows account. Decryption and SHA256 verified before removing local plaintext. UTF-8 DPAPI entropy: `Manage by HEDAX operational backup v1`.

Private deployment evidence and rollback images are retained on the dedicated Manage server. Source by HEDAX was not accessed. Actual LAN/offline/device installation, direct server access to Google's holiday feed, and mail configuration are independent work; this release does not claim them complete.
