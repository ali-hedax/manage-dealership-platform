-- Rollback for 0001_audit_immutable. Run manually after taking a backup.
DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
DROP FUNCTION IF EXISTS manage_audit_guard();
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
