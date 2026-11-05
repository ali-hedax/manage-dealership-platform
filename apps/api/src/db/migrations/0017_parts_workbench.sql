CREATE TABLE "external_contractors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"specialty" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_work" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contractor_id" uuid,
	"contractor_name" text,
	"mode" text,
	"appointment_at" timestamp with time zone,
	"promised_at" timestamp with time zone,
	"price_rial" bigint,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" uuid NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "sale_price_rial" bigint;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "handed_over_by" uuid;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "return_reason" text;--> statement-breakpoint
ALTER TABLE "external_contractors" ADD CONSTRAINT "external_contractors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_work" ADD CONSTRAINT "external_work_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_work" ADD CONSTRAINT "external_work_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_work" ADD CONSTRAINT "external_work_contractor_id_external_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."external_contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_statements" ADD CONSTRAINT "parts_statements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_statements" ADD CONSTRAINT "parts_statements_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts_statements" ADD CONSTRAINT "parts_statements_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_contractors_tenant_idx" ON "external_contractors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "external_work_tenant_idx" ON "external_work" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parts_statement_case_version_uq" ON "parts_statements" USING btree ("tenant_id","case_id","version");--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_handed_over_by_users_id_fk" FOREIGN KEY ("handed_over_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;