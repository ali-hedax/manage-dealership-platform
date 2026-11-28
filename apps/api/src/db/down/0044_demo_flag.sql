-- Rehearsal rollback only: the flag is derived (see 0044_demo_flag.sql) and can be set again.
ALTER TABLE "receptions" DROP COLUMN IF EXISTS "is_demo";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "is_demo";
