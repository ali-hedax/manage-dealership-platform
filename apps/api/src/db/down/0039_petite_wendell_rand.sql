-- Rehearsal rollback only. Preserve approved snapshots in a verified backup first.
ALTER TABLE "night_lists" DROP COLUMN IF EXISTS "approved_snapshot";
