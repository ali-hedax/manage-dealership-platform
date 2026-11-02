CREATE TABLE "vehicle_import_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"import_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"outcome" text NOT NULL,
	"source" jsonb NOT NULL,
	"values" jsonb NOT NULL,
	"identity" text,
	"case_id" uuid,
	"case_number" text,
	"changes" jsonb NOT NULL,
	"messages" jsonb NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" text DEFAULT 'preview' NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"sheet_name" text NOT NULL,
	"header_row" integer NOT NULL,
	"decisions" jsonb NOT NULL,
	"counts" jsonb NOT NULL,
	"blank_rows" jsonb NOT NULL,
	"unmapped_columns" jsonb NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" uuid
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "admission_no" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "admission_no_key" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "admitted_at_precision" text DEFAULT 'minute' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "import_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "import_ref" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "chassis_ref" text;--> statement-breakpoint
ALTER TABLE "vehicle_import_rows" ADD CONSTRAINT "vehicle_import_rows_import_id_vehicle_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."vehicle_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_import_rows" ADD CONSTRAINT "vehicle_import_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_import_rows" ADD CONSTRAINT "vehicle_import_rows_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_imports" ADD CONSTRAINT "vehicle_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_imports" ADD CONSTRAINT "vehicle_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_imports" ADD CONSTRAINT "vehicle_imports_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_import_rows_import_row_uq" ON "vehicle_import_rows" USING btree ("import_id","row_no");--> statement-breakpoint
CREATE INDEX "vehicle_import_rows_case_idx" ON "vehicle_import_rows" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_tenant_import_key_uq" ON "cases" USING btree ("tenant_id","import_key") WHERE "cases"."import_key" is not null;--> statement-breakpoint
CREATE INDEX "cases_tenant_admission_key_idx" ON "cases" USING btree ("tenant_id","admission_no_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_case_import_ref_uq" ON "tasks" USING btree ("case_id","import_ref") WHERE "tasks"."import_ref" is not null;