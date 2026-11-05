-- Disposable/test databases only: drops import history (row provenance) and the
-- admission/import columns. Run manually after a backup. Audit rows remain.
DROP INDEX IF EXISTS tasks_case_import_ref_uq;
DROP INDEX IF EXISTS cases_tenant_admission_key_idx;
DROP INDEX IF EXISTS cases_tenant_import_key_uq;
DROP TABLE IF EXISTS vehicle_import_rows;
DROP TABLE IF EXISTS vehicle_imports;
ALTER TABLE tasks DROP COLUMN IF EXISTS import_ref;
ALTER TABLE vehicles DROP COLUMN IF EXISTS chassis_ref;
ALTER TABLE cases
  DROP COLUMN IF EXISTS admission_no,
  DROP COLUMN IF EXISTS admission_no_key,
  DROP COLUMN IF EXISTS admitted_at_precision,
  DROP COLUMN IF EXISTS origin,
  DROP COLUMN IF EXISTS import_key;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
