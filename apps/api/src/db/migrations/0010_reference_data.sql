CREATE TABLE "reference_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"identity_key" text NOT NULL,
	"lookup_key" text NOT NULL,
	"data" jsonb NOT NULL,
	"source_import_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"sheet_name" text NOT NULL,
	"header_row" integer NOT NULL,
	"mapping" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"status" text DEFAULT 'preview' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reference_entries" ADD CONSTRAINT "reference_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_entries" ADD CONSTRAINT "reference_entries_source_import_id_reference_imports_id_fk" FOREIGN KEY ("source_import_id") REFERENCES "public"."reference_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_imports" ADD CONSTRAINT "reference_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_imports" ADD CONSTRAINT "reference_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reference_entries_identity_uq" ON "reference_entries" USING btree ("tenant_id","kind","identity_key");--> statement-breakpoint
CREATE INDEX "reference_entries_lookup_idx" ON "reference_entries" USING btree ("tenant_id","kind","lookup_key");