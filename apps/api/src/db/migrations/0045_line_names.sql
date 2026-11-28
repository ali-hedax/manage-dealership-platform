-- H4 part 2 (owner, 2026-11-28): labour and part names from the catalogue text that every real line of
-- کسب‌وکار carries (GrprDesc for labour, WgdsFarDes for parts). Lines read by Pulse only (kasb_line_id
-- «m:…» are typed by hand and keep their own name); a column the administrator confirmed in «منبع‌ها»
-- (tenants.settings.kasbFieldMap) keeps deciding. Text is cleaned like officialText (Arabic ي/ى/ك,
-- spaces, «null»). Only empty names or names equal to the description (the old default) are replaced.
UPDATE "reception_repairs" r SET "name" = c."text"
FROM (
  SELECT "id", nullif(nullif(btrim(regexp_replace(translate("official" ->> 'GrprDesc', 'يىك', 'ییک'), '\s+', ' ', 'g')), ''), 'null') AS "text"
  FROM "reception_repairs"
) c
WHERE c."id" = r."id" AND c."text" IS NOT NULL
  AND r."kasb_line_id" NOT LIKE 'm:%'
  AND (r."name" IS NULL OR r."name" IS NOT DISTINCT FROM r."description")
  AND r."tenant_id" NOT IN (SELECT "id" FROM "tenants" WHERE "settings" -> 'kasbFieldMap' ->> 'repairName' IS NOT NULL);--> statement-breakpoint
UPDATE "reception_parts" p SET "name" = c."text"
FROM (
  SELECT "id", nullif(nullif(btrim(regexp_replace(translate("official" ->> 'WgdsFarDes', 'يىك', 'ییک'), '\s+', ' ', 'g')), ''), 'null') AS "text"
  FROM "reception_parts"
) c
WHERE c."id" = p."id" AND c."text" IS NOT NULL
  AND p."kasb_line_id" NOT LIKE 'm:%'
  AND p."name" IS NULL
  AND p."tenant_id" NOT IN (SELECT "id" FROM "tenants" WHERE "settings" -> 'kasbFieldMap' ->> 'partName' IS NOT NULL);
