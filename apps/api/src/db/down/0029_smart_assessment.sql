-- Rehearsal rollback only. Never run on production without a verified backup.
DROP TABLE IF EXISTS "assessment_technical_reviews";

ALTER TABLE "assessments" DROP COLUMN IF EXISTS "smart_manual";
