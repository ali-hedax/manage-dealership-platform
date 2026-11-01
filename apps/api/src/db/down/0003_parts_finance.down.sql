-- Rollback for 0003_parts_finance. Run manually after taking a backup: it drops
-- parts, payer shares and financial approvals. Audit rows about them remain.
ALTER TABLE blockers DROP CONSTRAINT IF EXISTS blockers_part_request_id_part_requests_id_fk;
ALTER TABLE blockers DROP COLUMN IF EXISTS part_request_id;
DROP TABLE IF EXISTS financial_approvals;
DROP TABLE IF EXISTS case_finance;
DROP TABLE IF EXISTS part_requests;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
