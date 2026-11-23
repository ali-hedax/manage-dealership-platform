-- Rehearsal rollback only. Never run on production without a verified backup.
-- Reverts 0034_special_aid_module. Special-aid holds of vehicles without a case exist only
-- in this module; they are removed before case_id/part_request_id become NOT NULL again
-- (take a backup first: their audit rows stay in audit_events).
ALTER TABLE "stock_reservations" DROP CONSTRAINT IF EXISTS "stock_reservations_owner_ck";
ALTER TABLE "stock_reservations" DROP CONSTRAINT IF EXISTS "stock_reservations_special_aid_item_id_special_aid_items_id_fk";
DELETE FROM "stock_reservations" WHERE "special_aid_item_id" IS NOT NULL OR "case_id" IS NULL OR "part_request_id" IS NULL;
DROP INDEX IF EXISTS "stock_reservations_special_aid_idx";
ALTER TABLE "stock_reservations" DROP COLUMN IF EXISTS "special_aid_item_id";
ALTER TABLE "stock_reservations" ALTER COLUMN "case_id" SET NOT NULL;
ALTER TABLE "stock_reservations" ALTER COLUMN "part_request_id" SET NOT NULL;
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_resolved_by_users_id_fk";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "resolved_by";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "resolved_at";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "urgent";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "category";
DROP TABLE IF EXISTS "special_aid_contacts";
DROP TABLE IF EXISTS "special_aid_items";
DROP TABLE IF EXISTS "special_aid_groups";
DROP TABLE IF EXISTS "special_aid_admissions";
DROP TABLE IF EXISTS "special_aid_dossiers";
