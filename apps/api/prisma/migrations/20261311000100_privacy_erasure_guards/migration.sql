-- Review of 20261311000000 (30 Oct 2026): the owner function must itself refuse, not trust the app, when
-- (a) the company has not switched erasure on (privacy.erasure.enabled = on, default off);
-- (b) the person is still working or serving notice (an employment ends today or later counts as current; the first
--     version treated a future exited_on as "former", so notice-period staff could be erased);
-- (c) the Special-data period has not passed since the person's last day: the period of their last legal entity, else
--     the company's, else 1 year (the same rule as the app). Kept through the day n years after the last day.
CREATE OR REPLACE FUNCTION erase_special_documents(p_org UUID, p_person UUID) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ids UUID[];
  files UUID[];
  years INTEGER;
  ent UUID;
  last_day DATE;
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM app_current_org() THEN RAISE EXCEPTION 'Erasure runs only inside its own company'; END IF;
  IF coalesce((SELECT s.value #>> '{}' FROM settings s WHERE s.organization_id = p_org AND s.key = 'privacy.erasure.enabled' AND s.scope_type = 'tenant' LIMIT 1), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Erasure is switched off for this company';
  END IF;
  IF EXISTS (SELECT 1 FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
             WHERE e.organization_id = p_org AND e.person_id = p_person AND (m.exited_on IS NULL OR m.exited_on >= current_date))
     OR EXISTS (SELECT 1 FROM preboardings p WHERE p.organization_id = p_org AND p.person_id = p_person AND p.status = 'invited')
     OR NOT EXISTS (SELECT 1 FROM employees e WHERE e.organization_id = p_org AND e.person_id = p_person) THEN
    RAISE EXCEPTION 'Only a former employee''s Special data is erased';
  END IF;
  -- The period of the person's last legal entity, else the company's, else 1 year (the app's settingFor rule).
  SELECT m.legal_entity_id, m.exited_on INTO ent, last_day FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
    WHERE e.organization_id = p_org AND e.person_id = p_person ORDER BY m.exited_on DESC NULLS FIRST LIMIT 1;
  SELECT coalesce(
    (SELECT (s.value #>> '{}')::int FROM settings s WHERE s.organization_id = p_org AND s.key = 'privacy.retention.special_years' AND s.scope_type = 'legal_entity' AND s.scope_id = ent AND (s.value #>> '{}') ~ '^[0-9]+$' LIMIT 1),
    (SELECT (s.value #>> '{}')::int FROM settings s WHERE s.organization_id = p_org AND s.key = 'privacy.retention.special_years' AND s.scope_type = 'tenant' AND (s.value #>> '{}') ~ '^[0-9]+$' LIMIT 1),
    1) INTO years;
  IF last_day IS NULL OR last_day + make_interval(years => years) >= current_date THEN
    RAISE EXCEPTION 'The Special-data period has not passed since the last day';
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO ids FROM documents
    WHERE organization_id = p_org AND person_id = p_person AND type_key IN ('aadhaar', 'bgv_report');
  IF cardinality(ids) = 0 THEN RETURN 0; END IF;
  SELECT coalesce(array_agg(file_id), '{}') INTO files FROM document_versions WHERE organization_id = p_org AND document_id = ANY (ids);
  UPDATE bgv_checks SET result_document_id = NULL, updated_at = now() WHERE organization_id = p_org AND result_document_id = ANY (ids);
  UPDATE employee_profile_requests SET proof_document_id = NULL WHERE organization_id = p_org AND proof_document_id = ANY (ids);
  DELETE FROM reverification_asks WHERE organization_id = p_org AND document_id = ANY (ids);
  UPDATE documents SET current_version_id = NULL WHERE organization_id = p_org AND id = ANY (ids);
  DELETE FROM document_versions WHERE organization_id = p_org AND document_id = ANY (ids);
  DELETE FROM files f WHERE f.organization_id = p_org AND f.id = ANY (files)
    AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.organization_id = f.organization_id AND v.file_id = f.id);
  DELETE FROM documents WHERE organization_id = p_org AND id = ANY (ids);
  RETURN cardinality(ids);
END $$;
REVOKE ALL ON FUNCTION erase_special_documents(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erase_special_documents(UUID, UUID) TO app_runtime;
