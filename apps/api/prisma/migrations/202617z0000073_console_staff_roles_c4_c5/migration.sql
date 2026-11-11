-- Console staff roles, after C-4 and C-5 (founder answers 1058, 1164; 12 Nov 2026).
-- 1. The C-4 and C-5 keys go to roles, not to the staff account type: containment and feature switches to the Security
--    lead; planned maintenance is scheduled by the Security lead and seen by Customer success (a new view key). No
--    console key is left without a role.
-- 2. "Deactivate" in Staff and roles: a Security lead deactivates another member of staff, never themselves, never the
--    last active Security lead (the API ends their sessions in the same transaction).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.maintenance.view', 'See the planned maintenance windows (YukthiX staff)')
ON CONFLICT DO NOTHING;

INSERT INTO "platform_role_keys" ("role", "key") VALUES
  ('security_lead', 'platform.company.contain'),
  ('security_lead', 'platform.flags.manage'),
  ('security_lead', 'platform.maintenance.manage'),
  ('customer_success', 'platform.maintenance.view')
ON CONFLICT DO NOTHING;

-- C-4 and C-5 gave their keys to the staff account type; staff roles hold them now.
DELETE FROM "role_permissions" WHERE "role" = 'super_admin' AND "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" LIKE 'platform.%');

/** A Security lead deactivates another member of staff: never themselves; the last active Security lead stays. */
CREATE FUNCTION platform_deactivate_staff(p_user UUID, p_actor UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_is_super_admin() OR p_actor IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff deactivate staff'; END IF;
  LOCK TABLE platform_staff_roles IN SHARE ROW EXCLUSIVE MODE;
  IF p_actor = p_user THEN RAISE EXCEPTION 'YX_STAFF_SELF: nobody deactivates themselves'; END IF;
  IF NOT EXISTS (SELECT 1 FROM platform_staff_roles r JOIN users u ON u.id = r.user_id WHERE r.user_id = p_actor AND r.role = 'security_lead' AND u.status = 'active') THEN
    RAISE EXCEPTION 'YX_STAFF_NOT_LEAD: only a Security lead deactivates staff';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND organization_id IS NULL AND role = 'super_admin') THEN
    RAISE EXCEPTION 'YX_STAFF_NOT_FOUND: no such member of staff';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_user AND status <> 'active') THEN RAISE EXCEPTION 'YX_STAFF_STATE: already deactivated'; END IF;
  IF EXISTS (SELECT 1 FROM platform_staff_roles WHERE user_id = p_user AND role = 'security_lead')
     AND NOT EXISTS (SELECT 1 FROM platform_staff_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'security_lead' AND r.user_id <> p_user AND u.status = 'active') THEN
    RAISE EXCEPTION 'YX_STAFF_LAST_LEAD: the last Security lead stays active';
  END IF;
  UPDATE users SET status = 'deactivated' WHERE id = p_user;
END $$;
REVOKE ALL ON FUNCTION platform_deactivate_staff(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_deactivate_staff(UUID, UUID) TO app_runtime;
