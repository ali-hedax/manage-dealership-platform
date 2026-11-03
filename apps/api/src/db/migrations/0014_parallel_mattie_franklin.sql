CREATE TABLE "part_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_rial" bigint NOT NULL,
	"supplier" text NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text,
	"reference" text,
	"approver" text,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_calendars" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"effective_from" text NOT NULL,
	"calendar" jsonb NOT NULL,
	"reason" text NOT NULL,
	"version" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_stations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"trade" text NOT NULL,
	"responsible_user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "station_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "station_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "calendar_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "baseline_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "baseline_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "part_quotes" ADD CONSTRAINT "part_quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_quotes" ADD CONSTRAINT "part_quotes_part_id_part_requests_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."part_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_quotes" ADD CONSTRAINT "part_quotes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_quotes" ADD CONSTRAINT "part_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_quotes" ADD CONSTRAINT "part_quotes_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_calendars" ADD CONSTRAINT "work_calendars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_calendars" ADD CONSTRAINT "work_calendars_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_stations" ADD CONSTRAINT "workshop_stations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_stations" ADD CONSTRAINT "workshop_stations_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_stations" ADD CONSTRAINT "workshop_stations_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_quotes_tenant_part_idx" ON "part_quotes" USING btree ("tenant_id","part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_calendars_tenant_version_uq" ON "work_calendars" USING btree ("tenant_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_stations_tenant_code_uq" ON "workshop_stations" USING btree ("tenant_id","code");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_station_id_workshop_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."workshop_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;