-- Console staff, second part (founder answers 1171 and 1173, 12 Nov 2026).
-- 1171: a Security lead reactivates a deactivated member of staff: never themselves; only a deactivated account. They
--       come back with the roles they held (answer 1172 kept them) and sign in again with their security key (their
--       sessions ended when they were deactivated).
-- 1173: "Send the invitation again" needs no database change: a new link retires the old one (issuePasswordToken), and
--       the daily limit is the platform setting staff.invite.resends_per_day (3 by default, counted from the audit log).

/** A Security lead reactivates another member of staff who was deactivated. */
CREATE FUNCTION platform_reactivate_staff(p_user UUID, p_actor UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_is_super_admin() OR p_actor IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff reactivate staff'; END IF;
  LOCK TABLE platform_staff_roles IN SHARE ROW EXCLUSIVE MODE;
  IF p_actor = p_user THEN RAISE EXCEPTION 'YX_STAFF_SELF: nobody reactivates themselves'; END IF;
  IF NOT EXISTS (SELECT 1 FROM platform_staff_roles r JOIN users u ON u.id = r.user_id WHERE r.user_id = p_actor AND r.role = 'security_lead' AND u.status = 'active') THEN
    RAISE EXCEPTION 'YX_STAFF_NOT_LEAD: only a Security lead reactivates staff';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND organization_id IS NULL AND role = 'super_admin') THEN
    RAISE EXCEPTION 'YX_STAFF_NOT_FOUND: no such member of staff';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND status = 'deactivated') THEN RAISE EXCEPTION 'YX_STAFF_STATE: not deactivated'; END IF;
  UPDATE users SET status = 'active' WHERE id = p_user;
END $$;
REVOKE ALL ON FUNCTION platform_reactivate_staff(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_reactivate_staff(UUID, UUID) TO app_runtime;
