CREATE TABLE "special_aid_appointment_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dossier_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_aid_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"data_base64" text NOT NULL,
	"state" text DEFAULT 'unmatched' NOT NULL,
	"admission_no" text,
	"vin" text,
	"dossier_id" uuid,
	"admission_id" uuid,
	"extraction" jsonb,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_by" uuid,
	"matched_at" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_aid_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text,
	"message" text NOT NULL,
	"recipient_id" uuid NOT NULL,
	"dossier_id" uuid,
	"item_id" uuid,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"reply" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "special_aid_items" ADD COLUMN "replaces_item_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_titles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "special_aid_appointment_links" ADD CONSTRAINT "special_aid_appointment_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_appointment_links" ADD CONSTRAINT "special_aid_appointment_links_dossier_id_special_aid_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."special_aid_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_appointment_links" ADD CONSTRAINT "special_aid_appointment_links_entry_id_reference_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."reference_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_appointment_links" ADD CONSTRAINT "special_aid_appointment_links_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_cards" ADD CONSTRAINT "special_aid_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_cards" ADD CONSTRAINT "special_aid_cards_dossier_id_special_aid_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."special_aid_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_cards" ADD CONSTRAINT "special_aid_cards_admission_id_special_aid_admissions_id_fk" FOREIGN KEY ("admission_id") REFERENCES "public"."special_aid_admissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_cards" ADD CONSTRAINT "special_aid_cards_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_cards" ADD CONSTRAINT "special_aid_cards_matched_by_users_id_fk" FOREIGN KEY ("matched_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_feedback" ADD CONSTRAINT "special_aid_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_feedback" ADD CONSTRAINT "special_aid_feedback_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_feedback" ADD CONSTRAINT "special_aid_feedback_dossier_id_special_aid_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."special_aid_dossiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_feedback" ADD CONSTRAINT "special_aid_feedback_item_id_special_aid_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."special_aid_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_aid_feedback" ADD CONSTRAINT "special_aid_feedback_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "special_aid_appointment_links_uq" ON "special_aid_appointment_links" USING btree ("dossier_id","entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "special_aid_cards_hash_uq" ON "special_aid_cards" USING btree ("tenant_id","sha256");--> statement-breakpoint
CREATE INDEX "special_aid_cards_state_idx" ON "special_aid_cards" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE INDEX "special_aid_cards_dossier_idx" ON "special_aid_cards" USING btree ("tenant_id","dossier_id");--> statement-breakpoint
CREATE INDEX "special_aid_feedback_recipient_idx" ON "special_aid_feedback" USING btree ("tenant_id","recipient_id","issued_at");--> statement-breakpoint
ALTER TABLE "special_aid_items" ADD CONSTRAINT "special_aid_items_replaces_item_id_special_aid_items_id_fk" FOREIGN KEY ("replaces_item_id") REFERENCES "public"."special_aid_items"("id") ON DELETE no action ON UPDATE no action;