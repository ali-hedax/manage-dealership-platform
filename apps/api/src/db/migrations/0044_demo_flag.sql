ALTER TABLE "cases" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Existing sample data (H4 part 5). Only test dealerships hold the demo seed; a real dealership (is_test = false) is never touched.
-- Every case of a test dealership came from the demo seed or its sample accounts; demo receptions carry the seed's TESTVIN… VINs.
UPDATE "cases" SET "is_demo" = true WHERE "tenant_id" IN (SELECT "id" FROM "tenants" WHERE "is_test" = true);--> statement-breakpoint
UPDATE "receptions" SET "is_demo" = true WHERE "vin" LIKE 'TESTVIN%' AND "tenant_id" IN (SELECT "id" FROM "tenants" WHERE "is_test" = true);
