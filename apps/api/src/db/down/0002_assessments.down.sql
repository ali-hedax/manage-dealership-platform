-- Rollback for 0002_assessments. Run manually after taking a backup: it drops
-- every assessment and supplement. Audit rows about them remain.
DROP TABLE IF EXISTS assessment_items;
DROP TABLE IF EXISTS assessments;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
