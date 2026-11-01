CREATE TABLE "case_finance" (
	"case_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_share_rial" bigint,
	"insurer_share_rial" bigint,
	"company_share_rial" bigint,
	"note" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"amount_rial" bigint NOT NULL,
	"covers_estimate_rial" bigint NOT NULL,
	"reason" text NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proposed_by" uuid NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decision_note" text,
	"paid_at" timestamp with time zone,
	"payment_ref" text,
	"payment_confirmed_by" uuid,
	"is_test" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"assessment_item_id" uuid,
	"description" text NOT NULL,
	"part_number" text,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'needed' NOT NULL,
	"in_stock" boolean,
	"stock_checked_at" timestamp with time zone,
	"reserved_at" timestamp with time zone,
	"approved_unit_price_rial" bigint,
	"unit_price_rial" bigint,
	"price_approval_ref" text,
	"price_approved_by" text,
	"supplier" text,
	"order_ref" text,
	"ordered_at" timestamp with time zone,
	"eta_at" timestamp with time zone,
	"first_eta_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"receipt_doc_no" text,
	"inspection" text,
	"inspection_note" text,
	"handed_over_at" timestamp with time zone,
	"handed_over_department_id" uuid,
	"recipient_name" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"finance_basis" text,
	"finance_exception_id" uuid,
	"notes" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blockers" ADD COLUMN "part_request_id" uuid;--> statement-breakpoint
ALTER TABLE "case_finance" ADD CONSTRAINT "case_finance_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_finance" ADD CONSTRAINT "case_finance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_finance" ADD CONSTRAINT "case_finance_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_approvals" ADD CONSTRAINT "financial_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_approvals" ADD CONSTRAINT "financial_approvals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_approvals" ADD CONSTRAINT "financial_approvals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_approvals" ADD CONSTRAINT "financial_approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_approvals" ADD CONSTRAINT "financial_approvals_payment_confirmed_by_users_id_fk" FOREIGN KEY ("payment_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_assessment_item_id_assessment_items_id_fk" FOREIGN KEY ("assessment_item_id") REFERENCES "public"."assessment_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_handed_over_department_id_departments_id_fk" FOREIGN KEY ("handed_over_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_approvals_case_idx" ON "financial_approvals" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "financial_approvals_tenant_status_idx" ON "financial_approvals" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "part_requests_case_idx" ON "part_requests" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "part_requests_tenant_status_idx" ON "part_requests" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_part_request_id_part_requests_id_fk" FOREIGN KEY ("part_request_id") REFERENCES "public"."part_requests"("id") ON DELETE no action ON UPDATE no action;