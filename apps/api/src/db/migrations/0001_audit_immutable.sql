-- Audit events are append-only. UPDATE is always rejected. DELETE is rejected
-- unless the row is synthetic (is_test) AND the session explicitly enabled the
-- demo purge flag, which only the demo reset script sets.
CREATE OR REPLACE FUNCTION manage_audit_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND OLD.is_test
     AND current_setting('manage.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION manage_audit_guard();
