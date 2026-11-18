-- Down of 0028 (rehearsal only; never on Production with live data).
DROP TABLE IF EXISTS "part_code_corrections";
DROP TABLE IF EXISTS "app_releases";
ALTER TABLE "cases" DROP CONSTRAINT IF EXISTS "cases_deleted_by_users_id_fk";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "deleted_at", DROP COLUMN IF EXISTS "deleted_by", DROP COLUMN IF EXISTS "delete_reason", DROP COLUMN IF EXISTS "deleted_from_status";
ALTER TABLE "part_requests" DROP CONSTRAINT IF EXISTS "part_requests_stock_parallel_by_users_id_fk";
ALTER TABLE "part_requests" DROP COLUMN IF EXISTS "stock_parallel_at", DROP COLUMN IF EXISTS "stock_parallel_by", DROP COLUMN IF EXISTS "auto_reserve_blocked_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "release_seen";
