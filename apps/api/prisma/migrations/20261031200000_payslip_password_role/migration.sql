-- Forward fix for 20261031100000_payslip_password_lookup: a session switch is something the app role could set itself,
-- so the own-row rule now binds the app role (and its logins) directly, and the lookup function, which runs as the owner,
-- needs no switch. The app can never read another person's hash, whatever it sets.
DROP POLICY own_row ON "payslip_passwords";
CREATE POLICY own_row ON "payslip_passwords" AS RESTRICTIVE TO app_runtime
  USING ("user_id" = (SELECT app_current_user_id()))
  WITH CHECK ("user_id" = (SELECT app_current_user_id()));

CREATE OR REPLACE FUNCTION payslip_password_users(p_org UUID, p_ids UUID[]) RETURNS UUID[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE out UUID[];
BEGIN
  IF p_org IS DISTINCT FROM app_current_org() THEN RETURN '{}'; END IF;
  SELECT coalesce(array_agg(user_id), '{}') INTO out FROM payslip_passwords WHERE organization_id = p_org AND user_id = ANY (p_ids);
  RETURN out;
END $$;
