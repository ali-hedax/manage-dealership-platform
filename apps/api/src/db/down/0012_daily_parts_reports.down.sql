-- Disposable/test databases only: drops daily stock snapshots, Manage
-- reservations, Emdad follow-up, daily tasks and notifications. Run manually
-- after a backup. Audit rows remain.
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS daily_tasks;
DROP TABLE IF EXISTS emdad_request_events;
DROP TABLE IF EXISTS emdad_requests;
DROP TABLE IF EXISTS stock_reservations;
DROP TABLE IF EXISTS stock_snapshot_items;
DROP TABLE IF EXISTS stock_snapshots;
DROP TABLE IF EXISTS daily_report_rows;
DROP TABLE IF EXISTS daily_report_files;
DROP TABLE IF EXISTS daily_report_imports;
DROP TABLE IF EXISTS daily_report_profiles;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
