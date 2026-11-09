# Production release — HEDAX Signature `f47a4b5` — 2026-11-09

The owner approved merge and deployment once validation passed. This release integrates Nadia Fallah's HEDAX Signature design (PR #62) into main through PR #72. It has **no migration**.

| Item | Value |
| --- | --- |
| Commit | `f47a4b5885092c389ef27c8ba0256315e8fdd5cb` (merge of PR #72) |
| Previous version | `7515abb` (PR #70), rollback tag `rollback-signature-20261109` |
| PR CI | run 42586923915 on `b67c1cf`: 6/6 green |
| main CI | run 42588103421 on `f47a4b5`: 6/6 green |
| Artifact | 13660516215, ZIP SHA256 `0b150f21…cb48c08` equals the GitHub digest, inner `a8ec7f7c…1818474` |
| Migrations | 20 before and after, identical table set, `.env` unchanged |
| Switch window | 09:21:34–09:21:43 UTC (9 s; 12:51 Tehran) |
| Backups | pre-install `operational/20261109T091926Z`, final `operational/20261109T092245Z`. Each was restored into an isolated database and every table fingerprint matched |
| Recovery archive | server `/home/manage/incoming/signature-f47a4b5/recovery-final.tgz`, SHA256 `d360d7ef…a9426db`; same-hash copy on `F:\Manage Backups\signature-f47a4b5\recovery` |

## Process

The existing routine was used, derived from `staffpin-d68a036`, without the migration steps. It ran in the server folder `/home/manage/incoming/signature-f47a4b5`.

1. **prepare**
   - Checked health, the clean checkout at `7515abb`, the CI record and the artifact digest.
   - Confirmed that `apps/api/src/db` is unchanged.
   - Tagged rollback images.
   - Took a backup that was stable against live writes and restored it into an isolated database.
   - Loaded the exact CI images and ran a read-only probe on the restored copy (fingerprint unchanged).
   - The first attempt stopped before loading images because `fingerprint.cjs` still allow-listed the old rehearsal database name. Nothing running changed. After that name was fixed, the second attempt passed.
2. **install**: switched API and web to the new images, with automatic rollback on any failure. Then ran the live checks:
   - health
   - read-only probe with the owner identity (cases, Emdad, assessments, workshop, plan suggestion, parts workbench with 75 lines)
   - fingerprint before and after
   - manifest
   - `/login` returns 200; `/api/v1/dashboard` and `/api/v1/auth/me` return 401 without a session
   - 0 API error lines
3. **ui-check** (new): checked the live site.
   - `/login` is served with `data-ui="signature"`, the `manage-ui` boot script with the `classic` option, and the sign-in plinth (`sx-stage`).
   - The served CSS contains the `html[data-ui=signature]` layer and the Signature icon rules (`ico-s`).
   - `/login?ui=classic` returns 200.
4. **finalize**: final backup, isolated restore with every fingerprint matching, recovery archive, and removal of both scratch databases.

## After the release

- `/`, `/cases`, `/parts` and `/launch` redirect to sign-in without a session (302). JS chunks are served (200).
- With the client header and a username, login returns `EMAIL_LOGIN_REQUIRED`. This is expected: production requires email plus a TOTP code on that path.
- This session had no browser tool. The owner should check the new look and the classic fallback (`?ui=classic`, then `?ui=signature` to return) on the dealership computer and phone.

## Rollback

1. `git switch --detach 7515abb` in `/opt/manage`.
2. Retag both images that carry the `rollback-signature-20261109` tag back to their plain names (api and web).
3. Run `operational-compose.sh up -d --no-deps --no-build --wait api web`.

There is no migration, so no database step is needed. A per-browser fallback without a rollback is `?ui=classic`.
