-- Founder decision 5d-D3 (9 Oct 2026): the password for emailed payslips is one the employee sets in My security, kept
-- only as an argon2 hash (never the date of birth). Each person sees and changes only their own row.
CREATE TABLE "payslip_passwords" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_passwords_pkey" PRIMARY KEY ("organization_id", "user_id"),
    CONSTRAINT "payslip_passwords_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payslip_passwords_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
REVOKE TRUNCATE ON TABLE "payslip_passwords" FROM app_runtime;

ALTER TABLE "payslip_passwords" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payslip_passwords"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "payslip_passwords" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
-- Only the person themselves; no admin or super-admin escape.
CREATE POLICY own_row ON "payslip_passwords" AS RESTRICTIVE
  USING ("user_id" = (SELECT app_current_user_id()))
  WITH CHECK ("user_id" = (SELECT app_current_user_id()));

-- Publishing asks only which of these people have set one (never the hash), for the current company.
CREATE FUNCTION payslip_password_users(p_org UUID, p_ids UUID[]) RETURNS UUID[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE out UUID[];
BEGIN
  IF p_org IS DISTINCT FROM app_current_org() THEN RETURN '{}'; END IF;
  SELECT coalesce(array_agg(user_id), '{}') INTO out FROM payslip_passwords WHERE organization_id = p_org AND user_id = ANY (p_ids);
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION payslip_password_users(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payslip_password_users(UUID, UUID[]) TO app_runtime;
