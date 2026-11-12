-- Task 3: supplement (الحاقیه) rejections. Additive and nullable only.
-- assessment_items.replaces_item_id / replacement_basis: a new line that replaces a
-- line rejected in the official assessment (same technical code).
-- part_requests.assessment_rejected_at / _version: the line behind this part was
-- rejected; the part stays visible, is never cancelled automatically, and no longer
-- counts as a supply need or toward the cost alert. Down: src/db/down/0023_assessment_rejections.down.sql
ALTER TABLE "assessment_items" ADD COLUMN "replaces_item_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_items" ADD COLUMN "replacement_basis" text;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "assessment_rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "part_requests" ADD COLUMN "assessment_rejected_version" smallint;