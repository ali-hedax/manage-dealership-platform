-- Rehearsal rollback only. Never run on production without a verified backup.
ALTER TABLE "assessment_items" DROP COLUMN IF EXISTS "source_part_number";
