CREATE TABLE "stoppage_followers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stoppage_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by" uuid,
	"removed_at" timestamp with time zone,
	"is_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DROP INDEX "night_lists_tenant_day_uq";--> statement-breakpoint
ALTER TABLE "night_lists" ADD COLUMN "kind" text DEFAULT 'repair' NOT NULL;--> statement-breakpoint
ALTER TABLE "stoppage_followers" ADD CONSTRAINT "stoppage_followers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_followers" ADD CONSTRAINT "stoppage_followers_stoppage_id_stoppages_id_fk" FOREIGN KEY ("stoppage_id") REFERENCES "public"."stoppages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_followers" ADD CONSTRAINT "stoppage_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_followers" ADD CONSTRAINT "stoppage_followers_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stoppage_followers" ADD CONSTRAINT "stoppage_followers_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stoppage_followers_stoppage_idx" ON "stoppage_followers" USING btree ("tenant_id","stoppage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stoppage_followers_active_uq" ON "stoppage_followers" USING btree ("stoppage_id","user_id") WHERE "stoppage_followers"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "night_lists_tenant_day_kind_uq" ON "night_lists" USING btree ("tenant_id","day","kind");--> statement-breakpoint
-- The former single follow-up owner becomes the first follower (data kept; the column stays, unused).
INSERT INTO "stoppage_followers" ("id","tenant_id","stoppage_id","user_id","added_by","added_at","is_test")
SELECT gen_random_uuid(), s."tenant_id", s."id", s."follow_up_user_id", NULL, s."updated_at", s."is_test"
FROM "stoppages" s WHERE s."follow_up_user_id" IS NOT NULL;
