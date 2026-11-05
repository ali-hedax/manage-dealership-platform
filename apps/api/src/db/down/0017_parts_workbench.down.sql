DROP TABLE "parts_statements";
DROP TABLE "external_work";
DROP TABLE "external_contractors";
ALTER TABLE "part_requests" DROP COLUMN "return_reason";
ALTER TABLE "part_requests" DROP COLUMN "returned_at";
ALTER TABLE "part_requests" DROP COLUMN "consumed_at";
ALTER TABLE "part_requests" DROP COLUMN "handed_over_by";
ALTER TABLE "part_requests" DROP COLUMN "sale_price_rial";
