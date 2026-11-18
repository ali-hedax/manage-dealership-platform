CREATE TABLE "app_releases" (
	"version" text PRIMARY KEY NOT NULL,
	"commit" text,
	"first_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_code_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"part_request_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"original_code" text,
	"corrected_code" text,
	"previous_status" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "delete_reason" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "deleted_from_status" text;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "stock_parallel_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "stock_parallel_by" uuid;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "auto_reserve_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "release_seen" text;--> statement-breakpoint
ALTER TABLE "part_code_corrections" ADD CONSTRAINT "part_code_corrections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_code_corrections" ADD CONSTRAINT "part_code_corrections_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_code_corrections" ADD CONSTRAINT "part_code_corrections_part_request_id_part_requests_id_fk" FOREIGN KEY ("part_request_id") REFERENCES "public"."part_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_code_corrections" ADD CONSTRAINT "part_code_corrections_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_code_corrections" ADD CONSTRAINT "part_code_corrections_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_code_corrections_part_idx" ON "part_code_corrections" USING btree ("part_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "part_code_corrections_open_uq" ON "part_code_corrections" USING btree ("part_request_id") WHERE "part_code_corrections"."status" = 'open';--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_stock_parallel_by_users_id_fk" FOREIGN KEY ("stock_parallel_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;