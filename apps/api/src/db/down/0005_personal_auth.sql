-- Destructive rollback only for disposable data and an explicitly approved procedure.
DROP TABLE IF EXISTS auth_challenges;
DROP INDEX IF EXISTS users_email_uq;
ALTER TABLE sessions DROP COLUMN IF EXISTS verified_with_totp;
ALTER TABLE users DROP COLUMN IF EXISTS email;
ALTER TABLE users DROP COLUMN IF EXISTS activated_at;
ALTER TABLE users DROP COLUMN IF EXISTS encrypted_totp_secret;
ALTER TABLE users DROP COLUMN IF EXISTS totp_last_step;
