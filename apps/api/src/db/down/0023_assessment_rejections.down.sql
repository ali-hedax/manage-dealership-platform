-- Reverses 0023_assessment_rejections: drops the replacement link and the rejection flag.
-- Rejected assessment items keep approval_status = rejected; no other data is touched.
ALTER TABLE "part_requests" DROP COLUMN IF EXISTS "assessment_rejected_version";
ALTER TABLE "part_requests" DROP COLUMN IF EXISTS "assessment_rejected_at";
ALTER TABLE "assessment_items" DROP COLUMN IF EXISTS "replacement_basis";
ALTER TABLE "assessment_items" DROP COLUMN IF EXISTS "replaces_item_id";
