-- Rehearsal rollback only. Export reception_imports and the manual receptions first: receptions
-- entered from the manual «پذیرش و ریز کارت» file (source = 'manual', kasb_rcd 'manual:…') and their
-- lines stay as rows; only the new columns and the import log go away.
DROP TABLE IF EXISTS "reception_imports";
ALTER TABLE "receptions" DROP COLUMN IF EXISTS "source";
ALTER TABLE "receptions" DROP COLUMN IF EXISTS "lines_error_code";
ALTER TABLE "receptions" DROP COLUMN IF EXISTS "hall";
ALTER TABLE "reception_repairs" DROP COLUMN IF EXISTS "station";
ALTER TABLE "reception_repairs" DROP COLUMN IF EXISTS "technician";
ALTER TABLE "reception_repairs" DROP COLUMN IF EXISTS "name";
