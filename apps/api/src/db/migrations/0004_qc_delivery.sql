CREATE TABLE "case_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"amount_rial" bigint NOT NULL,
	"payment_ref" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"note" text,
	"recorded_by" uuid NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_inspections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"round" smallint NOT NULL,
	"outcome" text NOT NULL,
	"checks" jsonb NOT NULL,
	"note" text,
	"inspected_at" timestamp with time zone NOT NULL,
	"inspected_by" uuid NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "technical_closed_by" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "technical_close_note" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "financial_closed_by" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "financial_close_note" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "financial_close_estimate_rial" bigint;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "financial_close_share_rial" bigint;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "financial_close_waived_rial" bigint;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "delivered_by" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "recipient_name" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "recipient_relation" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "delivery_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "qc_inspection_id" uuid;--> statement-breakpoint
ALTER TABLE "case_payments" ADD CONSTRAINT "case_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_payments" ADD CONSTRAINT "case_payments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_payments" ADD CONSTRAINT "case_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_inspected_by_users_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_payments_case_idx" ON "case_payments" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qc_inspections_case_round_uq" ON "qc_inspections" USING btree ("case_id","round");--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_technical_closed_by_users_id_fk" FOREIGN KEY ("technical_closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_financial_closed_by_users_id_fk" FOREIGN KEY ("financial_closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_qc_inspection_id_qc_inspections_id_fk" FOREIGN KEY ("qc_inspection_id") REFERENCES "public"."qc_inspections"("id") ON DELETE no action ON UPDATE no action;