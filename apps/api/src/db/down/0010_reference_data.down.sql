-- Destructive: disposable databases only. Production rollback preserves these tables.
DROP TABLE IF EXISTS reference_entries;
DROP TABLE IF EXISTS reference_imports;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
