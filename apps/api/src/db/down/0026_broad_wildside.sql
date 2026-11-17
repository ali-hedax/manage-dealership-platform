-- Reverts 0026 (special-aid number, procurement code, warehouse receipt date).
-- Legacy request numbers in order_ref were never touched by 0026.
DROP INDEX IF EXISTS "part_requests_tenant_emdad_no_idx";
ALTER TABLE "part_requests" DROP COLUMN IF EXISTS "emdad_reserve_note";
ALTER TABLE "part_requests" DROP COLUMN IF EXISTS "emdad_received_quantity";
ALTER TABLE "part_requests" DROP COLUMN IF EXISTS "emdad_received_at";
ALTER TABLE "part_requests" DROP COLUMN IF EXISTS "procurement_code";
ALTER TABLE "part_requests" DROP COLUMN IF EXISTS "emdad_no";
