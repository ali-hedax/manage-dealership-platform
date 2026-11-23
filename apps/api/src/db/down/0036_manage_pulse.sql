-- Rehearsal rollback only. Never run on production without a verified backup.
-- Reverts 0036_manage_pulse: Manage Pulse connection, runs, commands and the reception module tables.
-- Nothing else references these tables; accident cases, parts, reservations and stock are untouched.
DROP TABLE IF EXISTS "reception_events";
DROP TABLE IF EXISTS "reception_notes";
DROP TABLE IF EXISTS "reception_documents";
DROP TABLE IF EXISTS "reception_external_work";
DROP TABLE IF EXISTS "reception_defects";
DROP TABLE IF EXISTS "reception_repairs";
DROP TABLE IF EXISTS "reception_parts";
DROP TABLE IF EXISTS "receptions";
DROP TABLE IF EXISTS "pulse_commands";
DROP TABLE IF EXISTS "pulse_runs";
DROP TABLE IF EXISTS "pulse_connections";
