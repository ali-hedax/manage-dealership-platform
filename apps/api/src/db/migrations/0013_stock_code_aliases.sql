CREATE TABLE "stock_code_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_stock_code" text NOT NULL,
	"base_part_number" text,
	"reason" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_code_aliases" ADD CONSTRAINT "stock_code_aliases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_code_aliases" ADD CONSTRAINT "stock_code_aliases_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_code_aliases_tenant_code_uq" ON "stock_code_aliases" USING btree ("tenant_id","full_stock_code");