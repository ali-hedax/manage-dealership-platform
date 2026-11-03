CREATE TABLE "daily_report_files" (
	"import_id" uuid PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_report_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_sha256" text NOT NULL,
	"format" text NOT NULL,
	"parser_version" text NOT NULL,
	"sheet_name" text,
	"header_row" integer,
	"diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"report_at" timestamp with time zone,
	"report_at_precision" text,
	"report_declared_by" uuid,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" uuid,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_report_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"header_signature" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reminder_time" text DEFAULT '11:00' NOT NULL,
	"reminder_user_id" uuid,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_report_rows" (
	"import_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"outcome" text NOT NULL,
	"row_key" text,
	"data" jsonb NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ref_id" uuid,
	CONSTRAINT "daily_report_rows_import_id_row_no_pk" PRIMARY KEY("import_id","row_no")
);
--> statement-breakpoint
CREATE TABLE "daily_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"local_date" text NOT NULL,
	"kind" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_import_id" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"unchanged_declared" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emdad_request_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"report_at" timestamp with time zone NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emdad_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	"admission_no" text,
	"chassis" text,
	"emdad_no" text,
	"request_no" text,
	"initial_code" text,
	"official" jsonb NOT NULL,
	"status_category" text NOT NULL,
	"first_import_id" uuid NOT NULL,
	"last_import_id" uuid NOT NULL,
	"last_report_at" timestamp with time zone NOT NULL,
	"case_id" uuid,
	"part_request_id" uuid,
	"match_status" text NOT NULL,
	"match_source" text DEFAULT 'auto' NOT NULL,
	"match_note" text,
	"assignee_user_id" uuid,
	"due_at" timestamp with time zone,
	"note" text,
	"next_action" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"part_request_id" uuid NOT NULL,
	"full_stock_code" text NOT NULL,
	"location_address" text DEFAULT '' NOT NULL,
	"quantity" numeric(20, 4) NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"unit_sale_price" numeric(24, 3),
	"unit_avg_price" numeric(24, 3),
	"currency" text,
	"reserved_by" uuid NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_at" timestamp with time zone,
	"issued_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"reason" text,
	"reflected_at" timestamp with time zone,
	"reflected_by" uuid,
	"reflected_snapshot_id" uuid,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_snapshot_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"raw_code" text NOT NULL,
	"full_stock_code" text NOT NULL,
	"base_part_number" text,
	"supply_suffix" text,
	"code_kind" text NOT NULL,
	"description" text,
	"unit" text,
	"vehicle_model" text,
	"location_address" text DEFAULT '' NOT NULL,
	"location_text" text,
	"base_status" text,
	"quantity" numeric(20, 4) NOT NULL,
	"avg_price" numeric(24, 3),
	"sale_price" numeric(24, 3)
);
--> statement-breakpoint
CREATE TABLE "stock_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"reported_at_precision" text NOT NULL,
	"scope" text,
	"completeness" text,
	"quantity_meaning" text,
	"currency" text,
	"tax_included" boolean,
	"status" text DEFAULT 'active' NOT NULL,
	"item_count" integer NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_report_files" ADD CONSTRAINT "daily_report_files_import_id_daily_report_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."daily_report_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_imports" ADD CONSTRAINT "daily_report_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_imports" ADD CONSTRAINT "daily_report_imports_report_declared_by_users_id_fk" FOREIGN KEY ("report_declared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_imports" ADD CONSTRAINT "daily_report_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_imports" ADD CONSTRAINT "daily_report_imports_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_profiles" ADD CONSTRAINT "daily_report_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_profiles" ADD CONSTRAINT "daily_report_profiles_reminder_user_id_users_id_fk" FOREIGN KEY ("reminder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_profiles" ADD CONSTRAINT "daily_report_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_rows" ADD CONSTRAINT "daily_report_rows_import_id_daily_report_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."daily_report_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_completed_import_id_daily_report_imports_id_fk" FOREIGN KEY ("completed_import_id") REFERENCES "public"."daily_report_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_request_events" ADD CONSTRAINT "emdad_request_events_request_id_emdad_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."emdad_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_request_events" ADD CONSTRAINT "emdad_request_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_request_events" ADD CONSTRAINT "emdad_request_events_import_id_daily_report_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."daily_report_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_requests" ADD CONSTRAINT "emdad_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_requests" ADD CONSTRAINT "emdad_requests_first_import_id_daily_report_imports_id_fk" FOREIGN KEY ("first_import_id") REFERENCES "public"."daily_report_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_requests" ADD CONSTRAINT "emdad_requests_last_import_id_daily_report_imports_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."daily_report_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_requests" ADD CONSTRAINT "emdad_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_requests" ADD CONSTRAINT "emdad_requests_part_request_id_part_requests_id_fk" FOREIGN KEY ("part_request_id") REFERENCES "public"."part_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emdad_requests" ADD CONSTRAINT "emdad_requests_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_part_request_id_part_requests_id_fk" FOREIGN KEY ("part_request_id") REFERENCES "public"."part_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_snapshot_id_stock_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."stock_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_reserved_by_users_id_fk" FOREIGN KEY ("reserved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_reflected_by_users_id_fk" FOREIGN KEY ("reflected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_reflected_snapshot_id_stock_snapshots_id_fk" FOREIGN KEY ("reflected_snapshot_id") REFERENCES "public"."stock_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshot_items" ADD CONSTRAINT "stock_snapshot_items_snapshot_id_stock_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."stock_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshot_items" ADD CONSTRAINT "stock_snapshot_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshots" ADD CONSTRAINT "stock_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshots" ADD CONSTRAINT "stock_snapshots_import_id_daily_report_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."daily_report_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshots" ADD CONSTRAINT "stock_snapshots_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_report_imports_tenant_kind_idx" ON "daily_report_imports" USING btree ("tenant_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_report_profiles_tenant_kind_uq" ON "daily_report_profiles" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "daily_report_rows_outcome_idx" ON "daily_report_rows" USING btree ("import_id","outcome");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_tasks_tenant_day_kind_uq" ON "daily_tasks" USING btree ("tenant_id","local_date","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "emdad_request_events_import_uq" ON "emdad_request_events" USING btree ("request_id","import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emdad_requests_tenant_key_uq" ON "emdad_requests" USING btree ("tenant_id","external_key");--> statement-breakpoint
CREATE INDEX "emdad_requests_tenant_case_idx" ON "emdad_requests" USING btree ("tenant_id","case_id");--> statement-breakpoint
CREATE INDEX "emdad_requests_tenant_status_idx" ON "emdad_requests" USING btree ("tenant_id","status_category");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_key_uq" ON "notifications" USING btree ("tenant_id","user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "stock_reservations_tenant_code_idx" ON "stock_reservations" USING btree ("tenant_id","full_stock_code","status");--> statement-breakpoint
CREATE INDEX "stock_reservations_part_idx" ON "stock_reservations" USING btree ("part_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_snapshot_items_code_loc_uq" ON "stock_snapshot_items" USING btree ("snapshot_id","full_stock_code","location_address");--> statement-breakpoint
CREATE INDEX "stock_snapshot_items_tenant_code_idx" ON "stock_snapshot_items" USING btree ("tenant_id","full_stock_code");--> statement-breakpoint
CREATE INDEX "stock_snapshot_items_tenant_base_idx" ON "stock_snapshot_items" USING btree ("tenant_id","base_part_number");--> statement-breakpoint
CREATE INDEX "stock_snapshots_tenant_idx" ON "stock_snapshots" USING btree ("tenant_id","reported_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_snapshots_active_uq" ON "stock_snapshots" USING btree ("tenant_id") WHERE "stock_snapshots"."status" = 'active';