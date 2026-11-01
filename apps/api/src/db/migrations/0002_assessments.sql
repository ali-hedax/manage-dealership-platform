CREATE TABLE "assessment_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"line_no" smallint NOT NULL,
	"action" text NOT NULL,
	"description" text NOT NULL,
	"part_number" text,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"unit_price_rial" bigint DEFAULT 0 NOT NULL,
	"labour_department_id" uuid,
	"labour_rial" bigint DEFAULT 0 NOT NULL,
	"evidence" text,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"origin_item_id" uuid,
	"changed" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"version_no" smallint NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"previous_id" uuid,
	"assessor_name" text NOT NULL,
	"assessor_org" text,
	"assessed_at" timestamp with time zone NOT NULL,
	"reason" text,
	"discovered_at" timestamp with time zone,
	"notes" text,
	"finalized_at" timestamp with time zone,
	"finalized_by" uuid,
	"parts_rial" bigint DEFAULT 0 NOT NULL,
	"labour_rial" bigint DEFAULT 0 NOT NULL,
	"approved_rial" bigint,
	"authorization_status" text DEFAULT 'pending' NOT NULL,
	"authorization_source" text,
	"authorization_method" text,
	"authorization_ref" text,
	"authorization_at" timestamp with time zone,
	"authorization_note" text,
	"authorization_recorded_by" uuid,
	"blocker_id" uuid,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_labour_department_id_departments_id_fk" FOREIGN KEY ("labour_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_authorization_recorded_by_users_id_fk" FOREIGN KEY ("authorization_recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_blocker_id_blockers_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."blockers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_items_assessment_idx" ON "assessment_items" USING btree ("assessment_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_case_version_uq" ON "assessments" USING btree ("case_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_case_draft_uq" ON "assessments" USING btree ("case_id") WHERE "assessments"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "assessments_tenant_auth_idx" ON "assessments" USING btree ("tenant_id","authorization_status");