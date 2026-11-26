CREATE TABLE "stoppage_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"parser_version" integer NOT NULL,
	"row_count" integer NOT NULL,
	"stoppage_count" integer NOT NULL,
	"summary" jsonb NOT NULL,
	"imported_by" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stoppage_item_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"official" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stoppage_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stoppage_id" uuid NOT NULL,
	"row_key" text NOT NULL,
	"official" jsonb NOT NULL,
	"notes" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"active" boolean NOT NULL,
	"stage" text NOT NULL,
	"emdad_request_id" uuid,
	"aid_link" text,
	"first_import_id" uuid NOT NULL,
	"last_import_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stoppages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"notice_no" text NOT NULL,
	"chassis" text NOT NULL,
	"official" jsonb NOT NULL,
	"active" boolean NOT NULL,
	"stage" text NOT NULL,
	"stopped_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"first_import_id" uuid NOT NULL,
	"last_import_id" uuid NOT NULL,
	"follow_up_user_id" uuid,
	"reception_id" uuid,
	"link_state" text DEFAULT 'none' NOT NULL,
	"link_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stoppage_imports" ADD CONSTRAINT "stoppage_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_imports" ADD CONSTRAINT "stoppage_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_item_versions" ADD CONSTRAINT "stoppage_item_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_item_versions" ADD CONSTRAINT "stoppage_item_versions_item_id_stoppage_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stoppage_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_item_versions" ADD CONSTRAINT "stoppage_item_versions_import_id_stoppage_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."stoppage_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_items" ADD CONSTRAINT "stoppage_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_items" ADD CONSTRAINT "stoppage_items_stoppage_id_stoppages_id_fk" FOREIGN KEY ("stoppage_id") REFERENCES "public"."stoppages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_items" ADD CONSTRAINT "stoppage_items_emdad_request_id_emdad_requests_id_fk" FOREIGN KEY ("emdad_request_id") REFERENCES "public"."emdad_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_items" ADD CONSTRAINT "stoppage_items_first_import_id_stoppage_imports_id_fk" FOREIGN KEY ("first_import_id") REFERENCES "public"."stoppage_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_items" ADD CONSTRAINT "stoppage_items_last_import_id_stoppage_imports_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."stoppage_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppages" ADD CONSTRAINT "stoppages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppages" ADD CONSTRAINT "stoppages_first_import_id_stoppage_imports_id_fk" FOREIGN KEY ("first_import_id") REFERENCES "public"."stoppage_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppages" ADD CONSTRAINT "stoppages_last_import_id_stoppage_imports_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."stoppage_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppages" ADD CONSTRAINT "stoppages_follow_up_user_id_users_id_fk" FOREIGN KEY ("follow_up_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppages" ADD CONSTRAINT "stoppages_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stoppage_imports_tenant_hash_uq" ON "stoppage_imports" USING btree ("tenant_id","file_hash");--> statement-breakpoint
CREATE INDEX "stoppage_imports_tenant_at_idx" ON "stoppage_imports" USING btree ("tenant_id","imported_at");--> statement-breakpoint
CREATE INDEX "stoppage_item_versions_item_idx" ON "stoppage_item_versions" USING btree ("tenant_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stoppage_items_tenant_key_uq" ON "stoppage_items" USING btree ("tenant_id","row_key");--> statement-breakpoint
CREATE INDEX "stoppage_items_stoppage_idx" ON "stoppage_items" USING btree ("tenant_id","stoppage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stoppages_tenant_notice_uq" ON "stoppages" USING btree ("tenant_id","notice_no");--> statement-breakpoint
CREATE INDEX "stoppages_tenant_active_idx" ON "stoppages" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "stoppages_tenant_chassis_idx" ON "stoppages" USING btree ("tenant_id","chassis");