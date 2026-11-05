DROP TABLE "case_alert_responses";
ALTER TABLE "users" DROP COLUMN "pin_hash";
ALTER TABLE "tenants" DROP COLUMN "settings";
ALTER TABLE "sessions" DROP COLUMN "auth_method";
