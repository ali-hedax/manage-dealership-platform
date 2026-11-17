ALTER TABLE "part_requests" ADD COLUMN "emdad_no" text;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "procurement_code" text;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "emdad_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "emdad_received_quantity" smallint;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "emdad_reserve_note" text;--> statement-breakpoint
CREATE INDEX "part_requests_tenant_emdad_no_idx" ON "part_requests" USING btree ("tenant_id","emdad_no") WHERE "part_requests"."emdad_no" is not null;