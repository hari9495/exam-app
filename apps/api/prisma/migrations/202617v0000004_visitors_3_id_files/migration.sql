-- Visitors slice 3 (answer 603): the app may not delete stored files (they are kept as uploaded), so the photos of IDs
-- are deleted through this owner's function: only the company's own, only visitor ID photos, only once no visit points
-- at them (the ID retention sweep and a replaced photo).
CREATE FUNCTION erase_visitor_id_files(p_org UUID, p_files UUID[]) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n INTEGER;
BEGIN
  IF p_org IS NULL OR (p_org IS DISTINCT FROM app_current_org() AND NOT app_is_super_admin()) THEN RAISE EXCEPTION 'Erasure runs only inside its own company'; END IF;
  DELETE FROM files f WHERE f.organization_id = p_org AND f.id = ANY (p_files) AND f.area = 'visitor_id'
    AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.organization_id = f.organization_id AND v.id_file_id = f.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION erase_visitor_id_files(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erase_visitor_id_files(UUID, UUID[]) TO app_runtime;
