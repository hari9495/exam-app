-- Forward fix for 20261025000000_payroll_5a (that file is never edited once applied): a removed company only clears the
-- archive's company link (the chain key stays), and archiving puts back the caller's super-admin setting afterwards.
CREATE OR REPLACE FUNCTION audit_archives_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A removed company only clears its link (ON DELETE SET NULL); the chain key stays.
  IF NEW."organization_id" IS NULL AND OLD."organization_id" IS NOT NULL AND (to_jsonb(NEW) - 'organization_id') = (to_jsonb(OLD) - 'organization_id') THEN
    RETURN NEW;
  END IF;
  IF OLD."deleted_at" IS NOT NULL OR NEW."deleted_at" IS NULL OR NEW."file_ref" IS NOT NULL
     OR (to_jsonb(NEW) - 'deleted_at' - 'file_ref') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'file_ref') THEN
    RAISE EXCEPTION 'An audit archive only ever loses its file once, after the retention period';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_archive_rows(p_chain UUID, p_upto BIGINT) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n BIGINT;
  was_super TEXT := coalesce(current_setting('app.is_super_admin', true), 'off');
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);
  IF NOT EXISTS (
    SELECT 1 FROM audit_archives x JOIN audit_logs a ON a.chain_key = x.chain_key AND a.chain_seq = x.to_seq AND a.row_hash = x.last_hash
    WHERE x.chain_key = p_chain AND x.to_seq = p_upto) THEN
    RAISE EXCEPTION 'No matching archive for these audit rows';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_logs a WHERE a.chain_key = p_chain AND a.chain_seq <= p_upto AND a.created_at >= now() - interval '13 months') THEN
    RAISE EXCEPTION 'Audit rows of the last 13 months stay online';
  END IF;
  IF EXISTS (
    SELECT 1 FROM audit_logs a JOIN audit_legal_holds h ON h.organization_id = a.chain_key AND h.released_at IS NULL AND a.created_at BETWEEN h.from_at AND h.to_at
    WHERE a.chain_key = p_chain AND a.chain_seq <= p_upto) THEN
    RAISE EXCEPTION 'Audit rows under a legal hold are kept';
  END IF;
  PERFORM set_config('app.audit_archive', 'on', true);
  DELETE FROM audit_logs a WHERE a.chain_key = p_chain AND a.chain_seq <= p_upto;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.audit_archive', 'off', true);
  PERFORM set_config('app.is_super_admin', was_super, true);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION audit_archive_rows(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_archive_rows(UUID, BIGINT) TO app_runtime;
