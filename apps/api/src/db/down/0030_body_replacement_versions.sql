-- Rehearsal rollback only. Never run on production without a verified backup.
DROP TABLE IF EXISTS "app_versions";

ALTER TABLE "cases" DROP COLUMN IF EXISTS "body_replacement";
