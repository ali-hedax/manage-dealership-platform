-- Rehearsal rollback only. Export the stoppage tables to a verified backup first: they hold
-- the follow-up owner and reception decisions recorded in Manage.
DROP TABLE IF EXISTS "stoppage_item_versions";
DROP TABLE IF EXISTS "stoppage_items";
DROP TABLE IF EXISTS "stoppages";
DROP TABLE IF EXISTS "stoppage_imports";
