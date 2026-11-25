-- Console staff roles (answers 1058, 1086): a fresh installation has no Security lead to give the first roles. This
-- makes one YukthiX staff account the first Security lead, only while there is no active Security lead at all (the
-- seed and a new environment's first set-up use it; it does nothing afterwards).
CREATE FUNCTION platform_bootstrap_security_lead(p_user UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_is_super_admin() THEN RAISE EXCEPTION 'Only YukthiX staff set up staff roles'; END IF;
  LOCK TABLE platform_staff_roles IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM platform_staff_roles r JOIN users u ON u.id = r.user_id WHERE r.role = 'security_lead' AND u.status = 'active') THEN RETURN false; END IF;
  INSERT INTO platform_staff_roles (user_id, role) VALUES (p_user, 'security_lead');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION platform_bootstrap_security_lead(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_bootstrap_security_lead(UUID) TO app_runtime;
