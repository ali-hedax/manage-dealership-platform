# Entry and workbench release — 2026-11-05

Published with the owner's explicit authorization for this set without another approval prompt. Application/test commit `ad54f1513e1ed74130c343b9303b3fdf99af71b7` (implementation `1239beb`), [PR #41](https://github.com/ali-hedax/manage-dealership-platform/pull/41), stacked on `fix/short-case-vehicle-label`; no main merge. [All six CI checks](https://github.com/ali-hedax/manage-dealership-platform/actions/runs/41974333191) succeeded.

## Behavior and boundaries

- Refined Persian login; safe explicit return URLs, password manager, Authenticator and install guidance retained. Default sign-in and installed launch now show an explicit choice among permitted desks. Technician gets one clear assigned-jobs entry. No new role grants; repeated sidebar desk list removed.
- Case flags and secondary criteria collapse behind filters; applied criteria stay visible. Case list keeps the previously released short vehicle/owner labels.
- Each actual PartRequest has its own stock/reservation disclosure and exact-code chooser; the lower repeated selector list is gone. Related Emdad and existing history remain available. No automatic substitution/reservation or assessment-draft reservation.
- Public Iran Google holiday suggestions exclude observances and mark tentative dates; the same parser reads an Iran `.ics` file locally if server access fails. Reviewed suggestions enter a draft, then the existing versioned/audited calendar save; manual closures/hours and previous task calendar snapshots are preserved. No automatic verified-horizon extension or personal calendar/OAuth.
- **Known remaining limitation:** Google feed HTTP 200 from the owner's Windows machine, but direct requests from the dedicated host/API container time out (calendar.google.com and www.google.com). The production settings show this failure and the file fallback. Direct server refresh is **not** declared operational; no firewall/DNS/proxy change was made. Emergency closures still need authoritative review.

## Tests

CI: shared 17/17; API 185 passed with 9 PostgreSQL-only skips, followed by those 9 passing separately on PostgreSQL (5 + 4). Browser 34 passed, 2 optional screenshot skips; daily/reservation/support 3/3. Documentation/API inventory, secret/dependency scan and Docker/HTTPS smoke all passed.

Local final build and lint passed. Calendar/workshop API 12/12; entry/Auth/fallback browser 6/6; daily/support/reservation 3/3. The full local run had 33 passes and one old Authenticator direct-desk expectation; that assertion was corrected and re-run successfully, then the complete clean CI passed. An earlier build-overlapping run is excluded from evidence. Public Iran feed parsed as 56 holidays, 25 tentative, for 2026–2027; no real customer spreadsheet was used.

Live read-only review before publication loaded all 17 cases (nine sections each) and every one of the 30 visible menu destinations. After publication: 17 case rows with folded filters; owner landing lists seven permitted desks, repeated sidebar desk list count zero; a case with six requests has six per-part stock disclosures, zero lower repeated selectors, and a reachable reserve action. Calendar settings show the honest Google timeout and local-file route. No real reservation, purchase, payment, repair, approval, calendar revision or role change was created for testing. Evidence screenshots remain private on the owner's computer.

## Provenance and preservation

- CI artifact `13390903452`, `preview-images-ad54f1513e1ed74130c343b9303b3fdf99af71b7`, 108108180 bytes.
- ZIP SHA256 `b01dfb003b09c2295bda45b902945466d485e23b742b5b2d36e3868efaa26c29` matched GitHub's artifact digest; inner archive SHA256 `995120442e8eb5932e04bc6b3cc8ebac517f0048b23581f2242707e52257e65d`.
- CI source `49cc552523b7486925170d79559015dc4b42eaad`, tree `77be5d7038576b17e0990d6549694d1152a06d62`, equal to the checked-out application/test commit's tree.
- API image `sha256:8a4c14ccd489b910381833de0ed374db410557a318b83f2adce6e9e592d8df8c`; web `sha256:0ef9427a0364723eb99b90e448f95a3ff1e245e23734d3b44dbf4bac2dd07403`. Running image IDs match exactly. Health commit is null; source/tree/image evidence establishes provenance.
- Preflight backup `operational/20261105T052741Z` restored into a separate database. New-image read-only case/assessment/Emdad/calendar/station/parser probes and every table/migration fingerprint matched before/after rehearsal.
- Frozen pre-install backup `operational/20261105T054454Z`; all table fingerprints including accounts/sessions equal across source switch before restart, `.env` bytes unchanged. Fifteen migrations; no migration, reset or seed. TOTP, one owner and system administrator's effective 44 permissions (including the existing personal denial) preserved.
- Maintenance **05:44:53–05:45:33 UTC**, **09:14:53–09:15:33 Tehran**, **40 seconds**. API/web/db/gate healthy; Caddy reloaded with the existing configuration. No Source, main, domain or email change.
- Final backup `operational/20261105T054714Z` restored separately; every table/migration fingerprint matched the stable live database. Both exact release scratch databases removed. Recovery archive SHA256 `b03b3debb3cf0ed81b0b488e296a89580d13c7759c1a8481aa2961dcc0faa3d3`.
- Off-server copy `Documents/Manage Backups/entry-recovery-final-ad54f15-20261105.dpapi`: CurrentUser DPAPI, decrypt/checksum verified in memory, local plaintext removed. Rollback images retained as `manage-api:pre-entry-20261105` / web equivalent; private release evidence under `/home/manage/incoming/entry-1239beb`.

Next: normal user operation with the new entry/workbench. Direct Google connectivity is the remaining external limitation; do not silently activate tentative dates or alter network policy. Domain/email and actual phone/LAN/offline/Push work retain their prior independent scope.
