-- Forward fix for 20261031000000_payslip_password: the owner is under forced RLS too, so the lookup function saw only the
-- caller's own row. It now opens a transaction-local switch that the own-row policy honours for the lookup alone (it
-- returns user ids, never hashes), and puts it back.
DROP POLICY own_row ON "payslip_passwords";
CREATE POLICY own_row ON "payslip_passwords" AS RESTRICTIVE
  USING ("user_id" = (SELECT app_current_user_id()) OR current_setting('app.payslip_password_lookup', true) = 'on')
  WITH CHECK ("user_id" = (SELECT app_current_user_id()));

CREATE OR REPLACE FUNCTION payslip_password_users(p_org UUID, p_ids UUID[]) RETURNS UUID[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prev TEXT := current_setting('app.payslip_password_lookup', true);
  out UUID[];
BEGIN
  IF p_org IS DISTINCT FROM app_current_org() THEN RETURN '{}'; END IF;
  PERFORM set_config('app.payslip_password_lookup', 'on', true);
  SELECT coalesce(array_agg(user_id), '{}') INTO out FROM payslip_passwords WHERE organization_id = p_org AND user_id = ANY (p_ids);
  PERFORM set_config('app.payslip_password_lookup', coalesce(prev, 'off'), true);
  RETURN out;
END $$;
