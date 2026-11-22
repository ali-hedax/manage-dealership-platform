CREATE TABLE "special_aid_admissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dossier_id" uuid NOT NULL,
	"admission_key" text NOT NULL,
	"admission_no" text NOT NULL,
	"admission_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_aid_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dossier_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	"promised_at" timestamp with time zone,
	"item_ids" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_aid_dossiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vin" text NOT NULL,
	"postponed_until" timestamp with time zone,
	"postpone_reason" text,
	"attended_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_aid_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dossier_id" uuid NOT NULL,
	"label" text,
	"decision" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_aid_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dossier_id" uuid NOT NULL,
	"admission_id" uuid,
	"request_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"observed_category" text,
	"status_observed_at" timestamp with time zone,
	"arrival_observed_at" timestamp with time zone,
	"informed_at" timestamp with time zone,
	"group_id" uuid,
	"non_consumption_reason" text,
	"non_consumption_note" text,
	"non_consumption_by" uuid,
	"non_consumption_at" timestamp with time zone,
	"hold_note" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_reservations" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_reservations" ALTER COLUMN "part_request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "urgent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD COLUMN "special_aid_item_id" uuid;--> statement-breakpoint
ALTER TABLE "special_aid_admissions" ADD CONSTRAINT "special_aid_admissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_admissions" ADD CONSTRAINT "special_aid_admissions_dossier_id_special_aid_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."special_aid_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_contacts" ADD CONSTRAINT "special_aid_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_contacts" ADD CONSTRAINT "special_aid_contacts_dossier_id_special_aid_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."special_aid_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_contacts" ADD CONSTRAINT "special_aid_contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_dossiers" ADD CONSTRAINT "special_aid_dossiers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_groups" ADD CONSTRAINT "special_aid_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_groups" ADD CONSTRAINT "special_aid_groups_dossier_id_special_aid_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."special_aid_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_groups" ADD CONSTRAINT "special_aid_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_items" ADD CONSTRAINT "special_aid_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_items" ADD CONSTRAINT "special_aid_items_dossier_id_special_aid_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."special_aid_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_items" ADD CONSTRAINT "special_aid_items_admission_id_special_aid_admissions_id_fk" FOREIGN KEY ("admission_id") REFERENCES "public"."special_aid_admissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_items" ADD CONSTRAINT "special_aid_items_request_id_emdad_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."emdad_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_items" ADD CONSTRAINT "special_aid_items_group_id_special_aid_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."special_aid_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_items" ADD CONSTRAINT "special_aid_items_non_consumption_by_users_id_fk" FOREIGN KEY ("non_consumption_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "special_aid_admissions_key_uq" ON "special_aid_admissions" USING btree ("tenant_id","dossier_id","admission_key");--> statement-breakpoint
CREATE INDEX "special_aid_contacts_dossier_idx" ON "special_aid_contacts" USING btree ("tenant_id","dossier_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "special_aid_dossiers_tenant_vin_uq" ON "special_aid_dossiers" USING btree ("tenant_id","vin");--> statement-breakpoint
CREATE INDEX "special_aid_groups_dossier_idx" ON "special_aid_groups" USING btree ("tenant_id","dossier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "special_aid_items_request_uq" ON "special_aid_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "special_aid_items_dossier_idx" ON "special_aid_items" USING btree ("tenant_id","dossier_id");--> statement-breakpoint
CREATE INDEX "special_aid_items_state_idx" ON "special_aid_items" USING btree ("tenant_id","state");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_special_aid_item_id_special_aid_items_id_fk" FOREIGN KEY ("special_aid_item_id") REFERENCES "public"."special_aid_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_reservations_special_aid_idx" ON "stock_reservations" USING btree ("special_aid_item_id");--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_owner_ck" CHECK (("stock_reservations"."part_request_id" is not null and "stock_reservations"."case_id" is not null and "stock_reservations"."special_aid_item_id" is null) or ("stock_reservations"."part_request_id" is null and "stock_reservations"."case_id" is null and "stock_reservations"."special_aid_item_id" is not null));