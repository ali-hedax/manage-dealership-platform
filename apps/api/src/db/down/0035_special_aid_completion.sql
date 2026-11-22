-- Rehearsal rollback only. Never run on production without a verified backup.
-- Reverts 0035_special_aid_completion (card archive, feedback, appointment decisions,
-- replacement link, job titles, guest expiry). Imported appointment rows stay in reference_entries.
DROP TABLE IF EXISTS "special_aid_appointment_links";
DROP TABLE IF EXISTS "special_aid_feedback";
DROP TABLE IF EXISTS "special_aid_cards";
ALTER TABLE "special_aid_items" DROP CONSTRAINT IF EXISTS "special_aid_items_replaces_item_id_special_aid_items_id_fk";
ALTER TABLE "special_aid_items" DROP COLUMN IF EXISTS "replaces_item_id";
ALTER TABLE "users" DROP COLUMN IF EXISTS "access_expires_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "job_titles";
