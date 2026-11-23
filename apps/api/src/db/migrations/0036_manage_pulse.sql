CREATE TABLE "pulse_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress" jsonb,
	"result_code" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pulse_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dealer_code" text NOT NULL,
	"username" text NOT NULL,
	"password_enc" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'off' NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"captcha_image" text,
	"settings" jsonb NOT NULL,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_error_code" text,
	"worker_seen_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pulse_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text DEFAULT 'running' NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"details" jsonb,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_defects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reception_id" uuid NOT NULL,
	"kasb_line_id" text NOT NULL,
	"official" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL,
	"customer_text" text,
	"expert_text" text,
	"state" text,
	"type" text
);
--> statement-breakpoint
CREATE TABLE "reception_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reception_id" uuid NOT NULL,
	"external_work_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"sha256" text NOT NULL,
	"data_base64" text NOT NULL,
	"size" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reception_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb,
	"actor_user_id" uuid,
	"run_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_external_work" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reception_id" uuid NOT NULL,
	"contractor_id" uuid,
	"contractor_name" text,
	"description" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"done_at" timestamp with time zone,
	"amount_rial" bigint,
	"status" text DEFAULT 'sent' NOT NULL,
	"note" text,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reception_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_parts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reception_id" uuid NOT NULL,
	"kasb_line_id" text NOT NULL,
	"official" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL,
	"name" text,
	"code" text,
	"qty_requested" text,
	"qty_final" text,
	"unit_price_rial" bigint,
	"state" text,
	"special_aid" boolean DEFAULT false NOT NULL,
	"warranty" text,
	"reject_reason" text,
	"repair_line_id" text
);
--> statement-breakpoint
CREATE TABLE "reception_repairs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reception_id" uuid NOT NULL,
	"kasb_line_id" text NOT NULL,
	"official" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL,
	"code" text,
	"description" text,
	"state" text,
	"final_price_rial" bigint,
	"warranty" text,
	"defect_line_id" text
);
--> statement-breakpoint
CREATE TABLE "receptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kasb_rcd" text NOT NULL,
	"admission_no" text,
	"admission_no_key" text,
	"card_no" text,
	"chassis" text,
	"vin" text,
	"engine_no" text,
	"product_code" text,
	"product_name" text,
	"model_code" text,
	"model_name" text,
	"color" text,
	"plate" text,
	"plate_region" text,
	"plate_section" text,
	"plate_letter" text,
	"plate_three" text,
	"customer_name" text,
	"customer_phone" text,
	"customer_mobile" text,
	"customer_national_id" text,
	"customer_address" text,
	"deliverer_name" text,
	"deliverer_mobile" text,
	"entrance_km" integer,
	"admitted_at" timestamp with time zone,
	"status_code" text,
	"status_text" text,
	"released_at" timestamp with time zone,
	"is_open" boolean DEFAULT true NOT NULL,
	"station" text,
	"receptionist" text,
	"search_text" text DEFAULT '' NOT NULL,
	"official" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lines_read_at" timestamp with time zone,
	"case_id" uuid,
	"link_state" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pulse_commands" ADD CONSTRAINT "pulse_commands_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_commands" ADD CONSTRAINT "pulse_commands_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_connections" ADD CONSTRAINT "pulse_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_connections" ADD CONSTRAINT "pulse_connections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_runs" ADD CONSTRAINT "pulse_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_defects" ADD CONSTRAINT "reception_defects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_defects" ADD CONSTRAINT "reception_defects_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_documents" ADD CONSTRAINT "reception_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_documents" ADD CONSTRAINT "reception_documents_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_documents" ADD CONSTRAINT "reception_documents_external_work_id_reception_external_work_id_fk" FOREIGN KEY ("external_work_id") REFERENCES "public"."reception_external_work"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_documents" ADD CONSTRAINT "reception_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_events" ADD CONSTRAINT "reception_events_run_id_pulse_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pulse_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_external_work" ADD CONSTRAINT "reception_external_work_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_external_work" ADD CONSTRAINT "reception_external_work_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_external_work" ADD CONSTRAINT "reception_external_work_contractor_id_external_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."external_contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_external_work" ADD CONSTRAINT "reception_external_work_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_external_work" ADD CONSTRAINT "reception_external_work_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_notes" ADD CONSTRAINT "reception_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_notes" ADD CONSTRAINT "reception_notes_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_notes" ADD CONSTRAINT "reception_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_parts" ADD CONSTRAINT "reception_parts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_parts" ADD CONSTRAINT "reception_parts_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_repairs" ADD CONSTRAINT "reception_repairs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_repairs" ADD CONSTRAINT "reception_repairs_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pulse_commands_tenant_status_idx" ON "pulse_commands" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pulse_connections_tenant_uq" ON "pulse_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pulse_runs_tenant_started_idx" ON "pulse_runs" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reception_defects_line_uq" ON "reception_defects" USING btree ("reception_id","kasb_line_id");--> statement-breakpoint
CREATE INDEX "reception_defects_tenant_idx" ON "reception_defects" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reception_documents_hash_uq" ON "reception_documents" USING btree ("tenant_id","external_work_id","sha256");--> statement-breakpoint
CREATE INDEX "reception_events_reception_idx" ON "reception_events" USING btree ("reception_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reception_events_tenant_idx" ON "reception_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reception_external_work_reception_idx" ON "reception_external_work" USING btree ("tenant_id","reception_id");--> statement-breakpoint
CREATE INDEX "reception_notes_reception_idx" ON "reception_notes" USING btree ("tenant_id","reception_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reception_parts_line_uq" ON "reception_parts" USING btree ("reception_id","kasb_line_id");--> statement-breakpoint
CREATE INDEX "reception_parts_tenant_idx" ON "reception_parts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reception_repairs_line_uq" ON "reception_repairs" USING btree ("reception_id","kasb_line_id");--> statement-breakpoint
CREATE INDEX "reception_repairs_tenant_idx" ON "reception_repairs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receptions_tenant_rcd_uq" ON "receptions" USING btree ("tenant_id","kasb_rcd");--> statement-breakpoint
CREATE INDEX "receptions_tenant_open_idx" ON "receptions" USING btree ("tenant_id","is_open","admitted_at");--> statement-breakpoint
CREATE INDEX "receptions_tenant_admission_idx" ON "receptions" USING btree ("tenant_id","admission_no_key");--> statement-breakpoint
CREATE INDEX "receptions_tenant_vin_idx" ON "receptions" USING btree ("tenant_id","vin");