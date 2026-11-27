-- Rehearsal rollback only. Export stoppage_followers to a verified backup first: it holds the
-- followers recorded in Manage. An accident night list of a day is dropped (the per-day unique
-- index of 0037 cannot hold two lists of one day).
UPDATE "stoppages" s SET "follow_up_user_id" = f."user_id"
FROM (SELECT DISTINCT ON ("stoppage_id") "stoppage_id", "user_id" FROM "stoppage_followers" WHERE "removed_at" IS NULL ORDER BY "stoppage_id", "added_at") f
WHERE s."id" = f."stoppage_id";
DROP TABLE IF EXISTS "stoppage_followers";
DELETE FROM "night_list_items" WHERE "list_id" IN (SELECT "id" FROM "night_lists" WHERE "kind" <> 'repair');
DELETE FROM "night_lists" WHERE "kind" <> 'repair';
DROP INDEX IF EXISTS "night_lists_tenant_day_kind_uq";
ALTER TABLE "night_lists" DROP COLUMN IF EXISTS "kind";
CREATE UNIQUE INDEX IF NOT EXISTS "night_lists_tenant_day_uq" ON "night_lists" USING btree ("tenant_id","day");
