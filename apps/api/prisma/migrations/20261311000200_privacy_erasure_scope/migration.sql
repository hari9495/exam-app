-- Founder answers, 30 Oct 2026 (what Special data erasure deletes). Three changes, every earlier guard kept:
-- (1) Disability: the yes/no answer stays (the HR diversity list counts it); after the same period the sealed details
--     and the certificate go. disability_declarations gets erased_at, and the details check allows a "yes" whose
--     details were erased. The owner function also deletes documents of type disability_certificate.
-- (4) Offers that never joined are included, counted from the day the joining was cancelled: preboardings gets
--     cancelled_on (set by the app when it cancels; filled here from updated_at for joiners cancelled before today).
--     The function's "former employee" check now also accepts a person whose joining was cancelled and who has no
--     employment, and the period runs from that day (their last cancelled joining's legal entity).
ALTER TABLE "disability_declarations" ADD COLUMN "erased_at" TIMESTAMPTZ(3);
ALTER TABLE "disability_declarations" DROP CONSTRAINT "disability_declarations_details_check";
ALTER TABLE "disability_declarations"
  ADD CONSTRAINT "disability_declarations_details_check" CHECK (("answer" = 'yes' AND "withdrawn_at" IS NULL AND "erased_at" IS NULL) = ("details_enc" IS NOT NULL));

ALTER TABLE "preboardings" ADD COLUMN "cancelled_on" DATE;
ALTER TABLE "preboardings" NO FORCE ROW LEVEL SECURITY;
UPDATE "preboardings" SET "cancelled_on" = ("updated_at" AT TIME ZONE 'Asia/Kolkata')::date WHERE "status" = 'cancelled';
ALTER TABLE "preboardings" FORCE ROW LEVEL SECURITY;

-- Guards (a) switched on, (b) not working or serving notice, not joining again, (c) the period has passed: as in
-- 20261311000100, with the never-joined case added to (b) and (c).
CREATE OR REPLACE FUNCTION erase_special_documents(p_org UUID, p_person UUID) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ids UUID[];
  files UUID[];
  years INTEGER;
  ent UUID;
  last_day DATE;
  had_job BOOLEAN;
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM app_current_org() THEN RAISE EXCEPTION 'Erasure runs only inside its own company'; END IF;
  IF coalesce((SELECT s.value #>> '{}' FROM settings s WHERE s.organization_id = p_org AND s.key = 'privacy.erasure.enabled' AND s.scope_type = 'tenant' LIMIT 1), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Erasure is switched off for this company';
  END IF;
  had_job := EXISTS (SELECT 1 FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
                     WHERE e.organization_id = p_org AND e.person_id = p_person);
  IF EXISTS (SELECT 1 FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
             WHERE e.organization_id = p_org AND e.person_id = p_person AND (m.exited_on IS NULL OR m.exited_on >= current_date))
     OR EXISTS (SELECT 1 FROM preboardings p WHERE p.organization_id = p_org AND p.person_id = p_person AND p.status = 'invited')
     OR (NOT had_job AND NOT EXISTS (SELECT 1 FROM preboardings p WHERE p.organization_id = p_org AND p.person_id = p_person AND p.status = 'cancelled')) THEN
    RAISE EXCEPTION 'Only a former employee''s Special data is erased';
  END IF;
  IF had_job THEN
    SELECT m.legal_entity_id, m.exited_on INTO ent, last_day FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
      WHERE e.organization_id = p_org AND e.person_id = p_person ORDER BY m.exited_on DESC NULLS FIRST LIMIT 1;
  ELSE
    -- Never joined: the day their last joining was cancelled, at that joining's legal entity.
    SELECT p.legal_entity_id, p.cancelled_on INTO ent, last_day FROM preboardings p
      WHERE p.organization_id = p_org AND p.person_id = p_person AND p.status = 'cancelled' ORDER BY p.cancelled_on DESC NULLS FIRST LIMIT 1;
  END IF;
  -- The period of that legal entity, else the company's, else 1 year (the app's settingFor rule).
  SELECT coalesce(
    (SELECT (s.value #>> '{}')::int FROM settings s WHERE s.organization_id = p_org AND s.key = 'privacy.retention.special_years' AND s.scope_type = 'legal_entity' AND s.scope_id = ent AND (s.value #>> '{}') ~ '^[0-9]+$' LIMIT 1),
    (SELECT (s.value #>> '{}')::int FROM settings s WHERE s.organization_id = p_org AND s.key = 'privacy.retention.special_years' AND s.scope_type = 'tenant' AND (s.value #>> '{}') ~ '^[0-9]+$' LIMIT 1),
    1) INTO years;
  IF last_day IS NULL OR last_day + make_interval(years => years) >= current_date THEN
    RAISE EXCEPTION 'The Special-data period has not passed since the last day';
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO ids FROM documents
    WHERE organization_id = p_org AND person_id = p_person AND type_key IN ('aadhaar', 'bgv_report', 'disability_certificate');
  IF cardinality(ids) = 0 THEN RETURN 0; END IF;
  SELECT coalesce(array_agg(file_id), '{}') INTO files FROM document_versions WHERE organization_id = p_org AND document_id = ANY (ids);
  UPDATE bgv_checks SET result_document_id = NULL, updated_at = now() WHERE organization_id = p_org AND result_document_id = ANY (ids);
  UPDATE employee_profile_requests SET proof_document_id = NULL WHERE organization_id = p_org AND proof_document_id = ANY (ids);
  UPDATE disability_declarations SET certificate_document_id = NULL, updated_at = now() WHERE organization_id = p_org AND certificate_document_id = ANY (ids);
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
