CREATE TABLE "case_responsibility_periods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"reason" text,
	"origin" text DEFAULT 'transfer' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_recipients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reminder_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"seen_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"reply" text,
	"remind_at" timestamp with time zone NOT NULL,
	"reminded_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"case_id" uuid,
	"plate" text,
	"body" text NOT NULL,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"target_role" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_wages" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"amount_rial" bigint NOT NULL,
	"reason" text,
	"set_by" uuid NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_amount_rial" bigint,
	"seen_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_responsibility_periods" ADD CONSTRAINT "case_responsibility_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_responsibility_periods" ADD CONSTRAINT "case_responsibility_periods_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_responsibility_periods" ADD CONSTRAINT "case_responsibility_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_responsibility_periods" ADD CONSTRAINT "case_responsibility_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_recipients" ADD CONSTRAINT "reminder_recipients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_recipients" ADD CONSTRAINT "reminder_recipients_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_recipients" ADD CONSTRAINT "reminder_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_wages" ADD CONSTRAINT "technician_wages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_wages" ADD CONSTRAINT "technician_wages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_wages" ADD CONSTRAINT "technician_wages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_wages" ADD CONSTRAINT "technician_wages_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_responsibility_case_idx" ON "case_responsibility_periods" USING btree ("case_id","started_at");--> statement-breakpoint
CREATE INDEX "case_responsibility_tenant_user_idx" ON "case_responsibility_periods" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_responsibility_open_uq" ON "case_responsibility_periods" USING btree ("case_id") WHERE "case_responsibility_periods"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_recipients_uq" ON "reminder_recipients" USING btree ("reminder_id","user_id");--> statement-breakpoint
CREATE INDEX "reminder_recipients_user_idx" ON "reminder_recipients" USING btree ("tenant_id","user_id","status");--> statement-breakpoint
CREATE INDEX "reminder_recipients_due_idx" ON "reminder_recipients" USING btree ("status","remind_at");--> statement-breakpoint
CREATE INDEX "reminders_tenant_sender_idx" ON "reminders" USING btree ("tenant_id","sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "technician_wages_tenant_case_idx" ON "technician_wages" USING btree ("tenant_id","case_id");