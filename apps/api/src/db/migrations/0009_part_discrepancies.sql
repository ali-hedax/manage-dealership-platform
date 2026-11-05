CREATE TABLE "part_discrepancies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"part_request_id" uuid,
	"blocker_id" uuid,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"detail" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"condition_cleared_at" timestamp with time zone,
	"assignee_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_reason" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "part_discrepancies" ADD CONSTRAINT "part_discrepancies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_discrepancies" ADD CONSTRAINT "part_discrepancies_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_discrepancies" ADD CONSTRAINT "part_discrepancies_part_request_id_part_requests_id_fk" FOREIGN KEY ("part_request_id") REFERENCES "public"."part_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_discrepancies" ADD CONSTRAINT "part_discrepancies_blocker_id_blockers_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."blockers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_discrepancies" ADD CONSTRAINT "part_discrepancies_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_discrepancies" ADD CONSTRAINT "part_discrepancies_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "part_discrepancies_tenant_key_uq" ON "part_discrepancies" USING btree ("tenant_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "part_discrepancies_tenant_status_idx" ON "part_discrepancies" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "part_discrepancies_case_idx" ON "part_discrepancies" USING btree ("case_id");