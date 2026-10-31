-- Rollback for 0000_init: drops the whole schema. Only for an empty or
-- disposable database; never run against real data without a verified backup.
DROP TABLE IF EXISTS idempotency_keys, change_log, audit_events, blockers,
  task_dependencies, tasks, cases, case_counters, vehicles, customers,
  departments, sessions, users, tenants CASCADE;
DROP TABLE IF EXISTS drizzle.__drizzle_migrations;
