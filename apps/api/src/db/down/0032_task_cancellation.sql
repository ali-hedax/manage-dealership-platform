-- Rehearsal rollback only. Never run on production without a verified backup.
UPDATE "tasks" SET "status" = coalesce("cancelled_from_status", 'pending') WHERE "status" = 'cancelled';
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "cancelled_from_status";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "cancel_note";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "cancel_reason";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "cancelled_by";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "cancelled_at";
