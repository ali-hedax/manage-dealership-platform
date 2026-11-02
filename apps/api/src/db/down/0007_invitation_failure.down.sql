-- Disposable/test databases only. Preserve delivery/audit history on real installations.
ALTER TABLE auth_challenges DROP COLUMN invitation_failure;
