-- Disposable/test databases only: drops the discrepancy queue and its review
-- outcomes. Run manually after a backup. Audit rows of reviews remain.
DROP TABLE IF EXISTS part_discrepancies;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
