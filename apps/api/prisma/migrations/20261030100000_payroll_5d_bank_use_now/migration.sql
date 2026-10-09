-- Forward migration after 20261030000000_payroll_5d (that file is never edited once applied).
-- D11 expedited bank fix: the app may only change the end of a bank account (P02 §4.5), so a checker's confirmed
-- penny-drop lets the current account be used now through this one narrow definer function (current company only).
CREATE OR REPLACE FUNCTION bank_account_use_now(p_org UUID, p_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  IF p_org IS DISTINCT FROM app_current_org() THEN RETURN false; END IF;
  UPDATE employee_bank_accounts SET usable_from = now() WHERE organization_id = p_org AND id = p_id AND valid_to IS NULL AND usable_from > now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION bank_account_use_now(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bank_account_use_now(UUID, UUID) TO app_runtime;
