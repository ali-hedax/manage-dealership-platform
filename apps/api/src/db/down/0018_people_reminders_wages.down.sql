-- Disposable databases only: drops the phase 3 tables (reminders, wages, responsibility periods).
-- Rolling back the application keeps these tables; the previous version ignores them.
DROP TABLE "reminder_recipients";
DROP TABLE "reminders";
DROP TABLE "technician_wages";
DROP TABLE "case_responsibility_periods";
