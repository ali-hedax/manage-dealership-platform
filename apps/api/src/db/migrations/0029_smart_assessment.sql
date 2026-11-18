ALTER TABLE "assessments" ADD COLUMN "smart_manual" boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE TABLE "assessment_technical_reviews" (
 "item_id" uuid PRIMARY KEY NOT NULL REFERENCES "assessment_items"("id") ON DELETE CASCADE,
 "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
 "assessment_id" uuid NOT NULL REFERENCES "assessments"("id"),
 "status" text NOT NULL DEFAULT 'pending',
 "reason" text,
 "fingerprint" text NOT NULL,
 "reviewed_by" uuid REFERENCES "users"("id"),
 "reviewed_at" timestamp with time zone,
 "version" integer NOT NULL DEFAULT 1,
 "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "assessment_technical_reviews_tenant_idx" ON "assessment_technical_reviews" ("tenant_id","assessment_id");
