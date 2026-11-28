-- Rehearsal rollback only: names go back to the pre-H4 defaults (labour = description; part names that
-- came from WgdsFarDes emptied). Lines typed by hand and confirmed columns were never touched.
UPDATE "reception_repairs" SET "name" = "description" WHERE "kasb_line_id" NOT LIKE 'm:%' AND "official" ? 'GrprDesc'
  AND "tenant_id" NOT IN (SELECT "id" FROM "tenants" WHERE "settings" -> 'kasbFieldMap' ->> 'repairName' IS NOT NULL);
UPDATE "reception_parts" SET "name" = NULL WHERE "kasb_line_id" NOT LIKE 'm:%' AND "official" ? 'WgdsFarDes'
  AND "tenant_id" NOT IN (SELECT "id" FROM "tenants" WHERE "settings" -> 'kasbFieldMap' ->> 'partName' IS NOT NULL);
