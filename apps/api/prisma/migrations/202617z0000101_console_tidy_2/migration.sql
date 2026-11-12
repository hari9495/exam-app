-- Console tidy, second part (founder answer 1243, 12 Nov 2026): staff invited more than staff.invite.expire_days ago
-- (counted from the latest invitation) who never signed in are deactivated by the nightly job, as the system. Never
-- anyone who has signed in, and never the last active Security lead. Only the platform context may call it.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE FUNCTION platform_expire_invited_staff(p_days INTEGER, p_now TIMESTAMPTZ) RETURNS SETOF UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT app_is_super_admin() THEN RAISE EXCEPTION 'Only the platform expires staff invitations'; END IF;
  IF p_days IS NULL OR p_days < 7 OR p_days > 90 THEN RAISE EXCEPTION 'YX_STAFF_EXPIRE_DAYS: from 7 to 90 days'; END IF;
  LOCK TABLE platform_staff_roles IN SHARE ROW EXCLUSIVE MODE;
  FOR r IN
    SELECT u.id FROM users u
    WHERE u.organization_id IS NULL AND u.role = 'super_admin' AND u.status = 'active' AND u.last_login_at IS NULL
      AND GREATEST(u.created_at, COALESCE((SELECT max(a.created_at) FROM audit_logs a WHERE a.organization_id IS NULL AND a.action = 'platform.staff.invite_resent' AND a.entity_id = u.id::text), u.created_at))
          < p_now - make_interval(days => p_days)
    ORDER BY u.created_at
  LOOP
    -- The last active Security lead always stays (checked again for each person, as the set shrinks).
    IF EXISTS (SELECT 1 FROM platform_staff_roles WHERE user_id = r.id AND role = 'security_lead')
       AND NOT EXISTS (SELECT 1 FROM platform_staff_roles s JOIN users o ON o.id = s.user_id WHERE s.role = 'security_lead' AND s.user_id <> r.id AND o.status = 'active') THEN
      CONTINUE;
    END IF;
    UPDATE users SET status = 'deactivated' WHERE id = r.id AND status = 'active' AND last_login_at IS NULL;
    IF FOUND THEN RETURN NEXT r.id; END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION platform_expire_invited_staff(INTEGER, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_expire_invited_staff(INTEGER, TIMESTAMPTZ) TO app_runtime;
