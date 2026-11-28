CREATE TABLE "reception_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'preview' NOT NULL,
	"plan" jsonb NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" uuid,
	"applied_at" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reception_repairs" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "reception_repairs" ADD COLUMN "technician" text;--> statement-breakpoint
ALTER TABLE "reception_repairs" ADD COLUMN "station" text;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "hall" text;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "lines_error_code" text;--> statement-breakpoint
ALTER TABLE "receptions" ADD COLUMN "source" text DEFAULT 'pulse' NOT NULL;--> statement-breakpoint
ALTER TABLE "reception_imports" ADD CONSTRAINT "reception_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_imports" ADD CONSTRAINT "reception_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_imports" ADD CONSTRAINT "reception_imports_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reception_imports_tenant_sha_uq" ON "reception_imports" USING btree ("tenant_id","sha256");--> statement-breakpoint
CREATE INDEX "reception_imports_tenant_created_idx" ON "reception_imports" USING btree ("tenant_id","created_at");--> statement-breakpoint
-- The labour name starts as the description already stored for each line (the same value Manage showed until now).
UPDATE "reception_repairs" SET "name" = "description" WHERE "name" IS NULL AND "description" IS NOT NULL;
