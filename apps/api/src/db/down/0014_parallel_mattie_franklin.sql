-- Destructive rollback: preserve plan/quote history before executing outside synthetic tests.
ALTER TABLE tasks DROP COLUMN assigned_user_id, DROP COLUMN station_id, DROP COLUMN station_snapshot, DROP COLUMN calendar_snapshot, DROP COLUMN baseline_start_at, DROP COLUMN baseline_end_at;
DROP TABLE part_quotes;
DROP TABLE workshop_stations;
DROP TABLE work_calendars;
