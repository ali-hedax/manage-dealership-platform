-- Disposable development databases only. Operational application rollback keeps these columns.
ALTER TABLE users DROP COLUMN permission_overrides;
ALTER TABLE users DROP COLUMN is_owner;
ALTER TABLE tenants DROP COLUMN permission_version;
ALTER TABLE tenants DROP COLUMN permission_templates;
