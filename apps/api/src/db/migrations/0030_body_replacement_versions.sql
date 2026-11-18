ALTER TABLE "cases" ADD COLUMN "body_replacement" boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE TABLE "app_versions" (
 "version" text PRIMARY KEY NOT NULL,
 "major" integer NOT NULL,
 "minor" integer NOT NULL,
 "patch" integer NOT NULL,
 "commit" text NOT NULL,
 "note_keys" jsonb NOT NULL DEFAULT '[]'::jsonb,
 "confirmed_at" timestamp with time zone NOT NULL DEFAULT now(),
 CONSTRAINT "app_versions_commit_unique" UNIQUE("commit"),
 CONSTRAINT "app_versions_number_unique" UNIQUE("major","minor","patch")
);--> statement-breakpoint
INSERT INTO "app_versions" ("version","major","minor","patch","commit","note_keys","confirmed_at")
SELECT 'v1.0.0',1,0,0,'c6ffc5758630','["v1.0.0"]'::jsonb,"first_started_at" FROM "app_releases" WHERE "version"='v1.0.0'
ON CONFLICT DO NOTHING;
