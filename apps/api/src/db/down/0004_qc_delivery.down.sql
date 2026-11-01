-- Rollback for 0004_qc_delivery. Run manually after taking a backup: it drops
-- QC rounds, settlement payments and the close/handover columns of cases.
-- Audit rows about them remain.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_qc_inspection_id_qc_inspections_id_fk;
ALTER TABLE tasks DROP COLUMN IF EXISTS qc_inspection_id;
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_technical_closed_by_users_id_fk;
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_financial_closed_by_users_id_fk;
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_delivered_by_users_id_fk;
ALTER TABLE cases
  DROP COLUMN IF EXISTS technical_closed_by,
  DROP COLUMN IF EXISTS technical_close_note,
  DROP COLUMN IF EXISTS financial_closed_by,
  DROP COLUMN IF EXISTS financial_close_note,
  DROP COLUMN IF EXISTS financial_close_estimate_rial,
  DROP COLUMN IF EXISTS financial_close_share_rial,
  DROP COLUMN IF EXISTS financial_close_waived_rial,
  DROP COLUMN IF EXISTS delivered_by,
  DROP COLUMN IF EXISTS recipient_name,
  DROP COLUMN IF EXISTS recipient_relation,
  DROP COLUMN IF EXISTS delivery_note;
DROP TABLE IF EXISTS qc_inspections;
DROP TABLE IF EXISTS case_payments;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
