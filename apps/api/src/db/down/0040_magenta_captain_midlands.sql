-- Rehearsal rollback only. Preserve recorded corrections first.
ALTER TABLE "night_list_items" DROP COLUMN IF EXISTS "correction";
