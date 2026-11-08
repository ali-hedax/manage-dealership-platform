-- Disposable databases only: drops trusted PIN devices and the device password column.
-- Rolling back the application keeps them; the previous version ignores them.
DROP TABLE "trusted_devices";
ALTER TABLE "users" DROP COLUMN "device_password_hash";
