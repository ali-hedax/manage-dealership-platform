ALTER TABLE "tenants" ADD COLUMN "permission_templates" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "permission_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "permission_overrides" jsonb DEFAULT '{"allow":[],"deny":[]}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_owner_uq" ON "users" USING btree ("tenant_id") WHERE "users"."is_owner" = true;