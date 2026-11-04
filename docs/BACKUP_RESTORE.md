# Backup and restore

**Current status:** backup/restore has been exercised on Manage Production. The latest final restore passed for `operational/20261104T062953Z`, including published PWA/support metadata, existing daily reports and the preserved personal staff-administration denial. See the [release record](RELEASE_PWA_20261104.md). The generic examples below must use the operational wrapper on the current host.

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
| 2026-11-04 | Isolated copy of Manage Production | operational/20261104T062953Z | Counts/fingerprints recorded privately and matched | Full operational/account comparison passed; scratch DB removed, encrypted off-server recovery verified. |
| 2026-11-04 | Isolated copy of Manage Production | operational/20261104T051806Z | 15 / 54012 | Operational/account/calendar/access fingerprints matched; encrypted off-server recovery verified. |

## Verified Preview restore drill — 2026-11-02

The historical status above is superseded for the isolated Manage Preview: `/home/manage/backups/stage3-20261102T123555Z/db.dump` was restored into a separate temporary database before publishing PR #32. Counts matched: users 8, enrolled TOTP 1, cases 5, tasks 6, parts 4, audit 88, migrations 9. The temporary database was removed after verification; live data was not restored over or reset. Backup files and private configuration remain on the Manage VM with restrictive permissions.
