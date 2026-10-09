-- Forward fix for 20261028000000_payroll_5c (that file is never edited once applied).
-- The run's legal entity for system work (the calculation job, the approval decision), which must open the pay guard
-- before it can read the run: returns the entity only, for the current company.
CREATE OR REPLACE FUNCTION payroll_run_entity(p_org UUID, p_id UUID) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prev TEXT := current_setting('app.pay_entities', true);
  e UUID;
BEGIN
  IF p_org IS DISTINCT FROM app_current_org() THEN RETURN NULL; END IF;
  PERFORM set_config('app.pay_entities', '{' || coalesce((SELECT string_agg(id::text, ',') FROM legal_entities WHERE organization_id = p_org), '') || '}', true);
  SELECT legal_entity_id INTO e FROM payroll_runs WHERE organization_id = p_org AND id = p_id;
  PERFORM set_config('app.pay_entities', coalesce(prev, '{}'), true);
  RETURN e;
END $$;
REVOKE ALL ON FUNCTION payroll_run_entity(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_run_entity(UUID, UUID) TO app_runtime;
