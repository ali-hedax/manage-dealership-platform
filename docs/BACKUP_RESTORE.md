# Backup and restore

**Latest release (2026-11-07, 16:34 Tehran):** smart planning suggestions `813fcc4`, no migration.
- The pre-install backup `operational/20261107T130255Z` was restored into a scratch database, and all 50 table fingerprints matched live.
- The final backup `operational/20261107T130547Z` was restored, and all fingerprints matched. Both scratch databases were removed.
- Encrypted off-server copy: `F:Manage Backupssmart-recovery-final-813fcc4-20261107.dpapi`, decryption verified.
- See the [release record](RELEASE_SMART_20261107.md).

**Earlier release (2026-11-07, 11:20 Tehran):** technician unit and bay `5cf9c72`, no migration.
- The pre-install backup `operational/20261107T074828Z` was restored into a scratch database, and all 50 table fingerprints matched live.
- The final backup `operational/20261107T075121Z` was restored, and all fingerprints matched. Both scratch databases were removed.
- Encrypted off-server copy: `F:\Manage Backups\bay-recovery-final-5cf9c72-20261107.dpapi`, decryption verified. It is on drive F because C had no free space.
- See the [release record](RELEASE_BAY_20261107.md).

**Earlier release (2026-11-07, 10:29 Tehran):** staff page `ee86d5c`, no migration.
- The pre-install backup `operational/20261107T065755Z` was restored into a scratch database, and all 50 table fingerprints matched live.
- The final backup `operational/20261107T070041Z` was restored, and all fingerprints matched. Both scratch databases were removed.
- Encrypted off-server copy: `F:\Manage Backups\staff-recovery-final-ee86d5c-20261107.dpapi`, decryption verified. It is on drive F because C had no free space.
- See the [release record](RELEASE_STAFF_20261107.md).

**Earlier release (2026-11-07, morning):** integrated main `be3dd66` with three migrations.
- The pre-install backup `operational/20261107T051752Z` was restored into a scratch database. Migrations `0016`–`0018` were rehearsed there, and all 42 existing tables stayed equal.
- The frozen install backup is `operational/20261107T053406Z`. Restore it if data is damaged.
- The final backup `operational/20261107T053603Z` was restored, and all fingerprints matched. The scratch databases were removed.
- Encrypted off-server copy: `Documents/Manage Backups/integration-recovery-final-be3dd66-20261107.dpapi` (decryption verified).
- See the [release record](RELEASE_INTEGRATION_20261107.md).

**Previous release (2026-11-05):** owner-authorized entry/workbench `ad54f15` is installed with exact verified CI images, restored backups, preserved data/auth/access and no new migration/seed. Forty-second switch. Final backup `operational/20261105T054714Z`, encrypted off-server recovery verified. Direct Google holiday fetch currently times out on the host; the local Iran ICS-file path is available. See [release evidence](RELEASE_ENTRY_20261105.md). Earlier deployment entries below are history.

**Current status:** backup/restore has been exercised on Manage Production. The latest final restore passed for `operational/20261105T044951Z`, including published short-label source/settings, current operational data and the preserved personal staff-administration denial. CurrentUser DPAPI off-server recovery was decrypted/checksummed in memory. See the [release record](RELEASE_SHORT_LABEL_20261105.md). The generic examples below must use the operational wrapper on the current host.

## What to back up

| Item | How | Frequency (proposal) |
| --- | --- | --- |
| PostgreSQL database | `pg_dump -Fc` | Daily full + before every migration/deploy |
| Uploaded documents/photos | Object storage versioning or file copy | When the documents module ships |
| `.env` / secrets | Owner's password manager, never in Git or the backup bucket in clear text | On change |

Keep at least 7 daily and 4 weekly copies, one copy off the server (cloud backup for the LAN server, a different region/provider for the cloud node), encrypted at rest.

## Backup (Compose)

```bash
docker compose exec -T db pg_dump -U manage -d manage -Fc > backup/manage-$(date +%Y%m%d-%H%M).dump
```

## Restore drill (on a scratch database, never over production first)

```bash
docker compose exec -T db createdb -U manage manage_restore
docker compose exec -T db pg_restore -U manage -d manage_restore --no-owner < backup/manage-YYYYMMDD-HHMM.dump
docker compose exec -T db psql -U manage -d manage_restore -c "select count(*) from cases; select count(*) from audit_events;"
docker compose exec -T db dropdb -U manage manage_restore
```

Record date, dump file, row counts and result in the table below. The `audit_events` trigger is restored with the schema (pg_restore recreates it), so restored audit history remains append-only.

## Restore after an incident

1. Stop `api` and `web` (`docker compose stop api web`).
2. Take a dump of the current (damaged) state for investigation.
3. Restore the chosen dump into a fresh database, point `DATABASE_URL` at it, start `api`, verify `/api/v1/health` and spot-check cases.
4. With LAN + cloud nodes (future), resync from the restored node; see [OFFLINE_SYNC.md](OFFLINE_SYNC.md).

## Drill log

| Date | Environment | Dump | Rows (cases / audit) | Result |
| --- | --- | --- | --- | --- |
| 2026-11-07 | Isolated copy of Manage Production | operational/20261107T130255Z | 18 / 54211; 50 tables, 19 migrations | Pre-install backup for `813fcc4` (no migration); all fingerprints matched live. |
| 2026-11-07 | Isolated copy of Manage Production | operational/20261107T130547Z | 18 / 54211; 50 tables, 19 migrations | Final smart-planning release backup restored; both scratch DBs removed, encrypted off-server recovery verified. |
| 2026-11-07 | Isolated copy of Manage Production | operational/20261107T074828Z | 18 / 54175; 50 tables, 19 migrations | Pre-install backup for `5cf9c72` (no migration); all fingerprints matched live. |
| 2026-11-07 | Isolated copy of Manage Production | operational/20261107T075121Z | 18 / 54175; 50 tables, 19 migrations | Final bay release backup restored; both scratch DBs removed, encrypted off-server recovery verified. |
| 2026-11-07 | Isolated copy of Manage Production | operational/20261107T065755Z | 18 / 54175; 50 tables, 19 migrations | Pre-install backup for `ee86d5c` (no migration); all fingerprints matched live. |
| 2026-11-07 | Isolated copy of Manage Production | operational/20261107T070041Z | 18 / 54175; 50 tables, 19 migrations | Final staff-page backup restored; both scratch DBs removed, encrypted off-server recovery verified. |
| 2026-11-07 | Isolated copy of Manage Production | operational/20261107T051752Z | 18 / 54173; 42 tables fingerprinted | Migrations 0016–0018 rehearsed; all existing rows equal, new tables empty. |
| 2026-11-07 | Isolated copy of Manage Production | operational/20261107T053603Z | Full table/migration fingerprints (50 tables, 19 migrations) matched live | Final integration backup restored; both scratch DBs removed, encrypted off-server recovery verified. |
| 2026-11-05 | Isolated copy of Manage Production | operational/20261105T044951Z | Full table/migration fingerprints recorded privately and matched | Final short-label backup restored; three scratch DBs removed, encrypted off-server recovery verified. |
| 2026-11-04 | Isolated copy of Manage Production | operational/20261104T151335Z | Full table/migration fingerprints recorded privately and matched | Restored final compact-assessment backup; both scratch DBs removed; encrypted off-server recovery verified. |
| 2026-11-04 | Isolated copy of Manage Production | operational/20261104T062953Z | Counts/fingerprints recorded privately and matched | Full operational/account comparison passed; scratch DB removed, encrypted off-server recovery verified. |
| 2026-11-04 | Isolated copy of Manage Production | operational/20261104T051806Z | 15 / 54012 | Operational/account/calendar/access fingerprints matched; encrypted off-server recovery verified. |

## Verified Preview restore drill — 2026-11-02

The historical status above is superseded for the isolated Manage Preview: `/home/manage/backups/stage3-20261102T123555Z/db.dump` was restored into a separate temporary database before publishing PR #32. Counts matched: users 8, enrolled TOTP 1, cases 5, tasks 6, parts 4, audit 88, migrations 9. The temporary database was removed after verification; live data was not restored over or reset. Backup files and private configuration remain on the Manage VM with restrictive permissions.
