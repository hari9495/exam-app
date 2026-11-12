-- Answer 1826: a company default for new people, an email per notice or the daily digest (notify.email.default_cadence,
-- 'immediate' by default). Applied once when a person's account is made, in every path that makes one; each person
-- still changes their own afterwards. No data is written.
CREATE OR REPLACE FUNCTION users_default_cadence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  IF NEW.organization_id IS NOT NULL AND NEW.notification_digest = 'immediate' THEN
    SELECT s.value #>> '{}' INTO v FROM settings s
    WHERE s.organization_id = NEW.organization_id AND s.scope_type = 'tenant' AND s.key = 'notify.email.default_cadence'
    LIMIT 1;
    IF v IN ('immediate', 'daily') THEN NEW.notification_digest := v; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_default_cadence BEFORE INSERT ON "users" FOR EACH ROW EXECUTE FUNCTION users_default_cadence();
