CREATE TABLE "case_alert_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"response" text NOT NULL,
	"note" text,
	"responded_by" uuid NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auth_method" text DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "case_alert_responses" ADD CONSTRAINT "case_alert_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_alert_responses" ADD CONSTRAINT "case_alert_responses_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_alert_responses" ADD CONSTRAINT "case_alert_responses_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_alert_responses_uq" ON "case_alert_responses" USING btree ("case_id","kind","level");--> statement-breakpoint
CREATE INDEX "case_alert_responses_tenant_idx" ON "case_alert_responses" USING btree ("tenant_id");