-- People follow-up 12 (founder 30 Oct 2026): the nightly job deletes a former employee's Special documents (the masked
-- Aadhaar copy and background check reports) once privacy.retention.special_years has passed. The app role may not
-- delete documents, their versions or files (they are kept as uploaded), so this one function, run as the owner, does
-- it for one person of the caller's own company, only for those two types, and only when the person has no open job
-- and is not joining again. It returns how many documents went. The app drops the stored bytes first.
CREATE FUNCTION erase_special_documents(p_org UUID, p_person UUID) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ids UUID[];
  files UUID[];
BEGIN
  IF p_org IS NULL OR p_org IS DISTINCT FROM app_current_org() THEN RAISE EXCEPTION 'Erasure runs only inside its own company'; END IF;
  IF EXISTS (SELECT 1 FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
             WHERE e.organization_id = p_org AND e.person_id = p_person AND m.exited_on IS NULL)
     OR EXISTS (SELECT 1 FROM preboardings p WHERE p.organization_id = p_org AND p.person_id = p_person AND p.status = 'invited')
     OR NOT EXISTS (SELECT 1 FROM employees e WHERE e.organization_id = p_org AND e.person_id = p_person) THEN
    RAISE EXCEPTION 'Only a former employee''s Special data is erased';
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
