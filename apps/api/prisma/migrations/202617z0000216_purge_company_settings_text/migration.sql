-- Answer 1975 follow-up: a company's own retention settings are JSON values (settings.value is jsonb); purge_company
-- reads them as text. The function is otherwise as in 202617z0000214.
SELECT set_config('app.is_super_admin', 'on', true);

/*
 * Deletes one closed company's data, keeping its statutory records (above). It refuses unless:
 *   - the company is closed, and its data was not deleted before;
 *   - a deletion request for it is open, confirmed by a second staff member (approved_by set, not the asker);
 *   - the kept days are over (platform setting account.closure.keep_days, 30, never fewer than 30);
 *   - no legal hold is in place.
 * Every statement is per company. The kept records are tied to the closed company (its row stays, suspended), its
 * people cannot sign in (passwords and tokens gone), and its secrets and integration settings are cleared. The
 * request is marked done with the certificate (what was deleted, what was kept, why and until when) and its SHA-256.
 * p_extra adds the stored-file counts the API works out. Returns {id, certificate, sha256}.
 */
CREATE OR REPLACE FUNCTION purge_company(p_org uuid, p_extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record;
  d record;
  t text;
  col text;
  n bigint;
  pass int;
  progress boolean;
  keep_days int;
  stat_years int;
  audit_years int;
  pay_years int;
  until_audit timestamptz;
  until_pay timestamptz;
  until_filings timestamptz;
  until_all timestamptz;
  counts jsonb := '{}'::jsonb;
  kept jsonb := '[]'::jsonb;
  last_error jsonb := '{}'::jsonb;
  left_over text := '';
  total bigint := 0;
  retained text[];
  tables text[];
  cert jsonb;
  txt text;
  sha text;
BEGIN
  PERFORM set_config('app.current_org', p_org::text, true);
  PERFORM set_config('app.is_super_admin', 'on', true);
  PERFORM set_config('app.sd_system', 'on', true);
  PERFORM set_config('app.lifecycle_confidential', 'on', true);
  PERFORM set_config('app.record_visibility_governed', 'off', true);
  PERFORM set_config('app.portal_person_id', '', true);
  PERFORM set_config('app.consultant_portal', '', true);
  PERFORM set_config('app.pay_entities', coalesce((SELECT '{' || string_agg(id::text, ',') || '}' FROM legal_entities WHERE organization_id = p_org), '{}'), true);

  SELECT id, name, slug, lifecycle, lifecycle_changed_at, records_kept_until INTO o FROM organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND OR o.lifecycle <> 'closed' THEN
    RAISE EXCEPTION 'Only a closed company can be deleted.' USING ERRCODE = 'P0001';
  END IF;
  IF o.records_kept_until IS NOT NULL THEN
    RAISE EXCEPTION 'This company''s data was already deleted.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO d FROM company_deletions WHERE organization_id = p_org AND status = 'requested' FOR UPDATE;
  IF NOT FOUND OR d.approved_by IS NULL OR d.approved_by = d.requested_by THEN
    RAISE EXCEPTION 'Deleting a company''s data needs a request confirmed by a second staff member.' USING ERRCODE = 'P0001';
  END IF;
  keep_days := GREATEST(30, coalesce((SELECT value::int FROM platform_settings WHERE key = 'account.closure.keep_days' AND value ~ '^[0-9]{1,4}$'), 30));
  IF o.lifecycle_changed_at > now() - make_interval(days => keep_days) THEN
    RAISE EXCEPTION 'The data is kept % days after closing (until %).', keep_days, to_char(o.lifecycle_changed_at + make_interval(days => keep_days), 'YYYY-MM-DD') USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_legal_holds WHERE organization_id = p_org AND released_at IS NULL AND to_at > now()) THEN
    RAISE EXCEPTION 'A legal hold is in place for this company.' USING ERRCODE = 'P0001';
  END IF;

  -- How long each group is kept: never under the platform's statutory years (8), longer when the company chose so.
  stat_years := GREATEST(8, coalesce((SELECT value::int FROM platform_settings WHERE key = 'account.closure.statutory_keep_years' AND value ~ '^[0-9]{1,2}$'), 8));
  audit_years := GREATEST(stat_years, coalesce((SELECT max((value #>> '{}')::int) FROM settings WHERE organization_id = p_org AND key = 'audit.retention_years' AND (value #>> '{}') ~ '^[0-9]{1,2}$'), 0));
  pay_years := GREATEST(stat_years, coalesce((SELECT max((value #>> '{}')::int) FROM settings WHERE organization_id = p_org AND key = 'payroll.document_retention_years' AND (value #>> '{}') ~ '^[0-9]{1,2}$'), 0));
  until_audit := now() + make_interval(years => audit_years);
  until_pay := now() + make_interval(years => pay_years);
  until_filings := now() + make_interval(years => stat_years);
  until_all := GREATEST(until_audit, until_pay, until_filings);

  SELECT array_agg(DISTINCT r.table_name) INTO retained FROM company_retained_tables() r;
  SELECT array_agg(c.table_name::text ORDER BY c.table_name) INTO tables
  FROM information_schema.columns c
  JOIN information_schema.tables x ON x.table_schema = c.table_schema AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND c.table_name::text <> 'company_deletions' AND NOT (c.table_name::text = ANY (retained));

  -- What is kept, and why, and until when (counted before anything changes).
  FOR t, col IN SELECT DISTINCT ON (r.table_name) r.table_name, r.record_group FROM company_retained_tables() r WHERE r.table_name <> 'organizations' ORDER BY r.table_name LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE organization_id = $1', t) INTO n USING p_org;
    IF n > 0 THEN
      kept := kept || jsonb_build_object(
        'table', t, 'rows', n,
        'why', (SELECT r.why FROM company_retained_tables() r WHERE r.table_name = t LIMIT 1),
        'keptUntil', to_char(CASE col WHEN 'audit' THEN until_audit WHEN 'pay' THEN until_pay WHEN 'filings' THEN until_filings ELSE until_all END, 'YYYY-MM-DD'));
    END IF;
  END LOOP;

  -- Everything else goes, in passes as the foreign keys allow.
  FOR pass IN 1..60 LOOP
    progress := false;
    FOREACH t IN ARRAY tables LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE organization_id = $1', t) USING p_org;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          progress := true;
          total := total + n;
          counts := jsonb_set(counts, ARRAY[t], to_jsonb(coalesce((counts ->> t)::bigint, 0) + n));
        END IF;
      EXCEPTION WHEN OTHERS THEN
        last_error := jsonb_set(last_error, ARRAY[t], to_jsonb(SQLERRM));
      END;
    END LOOP;
    EXIT WHEN NOT progress;
  END LOOP;
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE organization_id = $1', t) INTO n USING p_org;
    IF n > 0 THEN left_over := left_over || format('%s (%s rows: %s); ', t, n, coalesce(last_error ->> t, 'still referenced')); END IF;
  END LOOP;
  IF left_over <> '' THEN
    RAISE EXCEPTION 'Not deleted, nothing changed: %', left(left_over, 1500) USING ERRCODE = 'P0001';
  END IF;

  -- The kept people cannot sign in: no password, no tokens, no secrets; deactivated.
  DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE organization_id = p_org);
  DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE organization_id = p_org);
  UPDATE users SET password_hash = '!', status = 'deactivated' WHERE organization_id = p_org;
  FOR col IN SELECT c.column_name::text FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'users' AND c.is_nullable = 'YES'
             AND c.column_name::text ~ '(encrypted|secret|_hash$|_enc$|token|avatar_path|email_signature)' LOOP
    EXECUTE format('UPDATE users SET %I = NULL WHERE organization_id = $1', col) USING p_org;
  END LOOP;
  -- The company's own secrets, integration addresses and stored pictures go; the row stays (the kept records' owner).
  FOR col IN SELECT c.column_name::text FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'organizations' AND c.is_nullable = 'YES'
             AND c.column_name::text ~ '(encrypted|secret|_hash$|^smtp_|^api_key_prefix$|webhook_url|_base_url$|target_url|^stripe_|logo_path|banner_path)' LOOP
    EXECUTE format('UPDATE organizations SET %I = NULL WHERE id = $1', col) USING p_org;
  END LOOP;
  UPDATE organizations SET status = 'suspended', records_kept_until = until_all WHERE id = p_org;

  cert := jsonb_build_object(
    'title', 'YukthiX deletion certificate',
    'company', jsonb_build_object('id', p_org, 'name', o.name, 'code', o.slug),
    'closedOn', to_char(o.lifecycle_changed_at, 'YYYY-MM-DD'),
    'deletedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'askedBy', d.requested_by,
    'confirmedBy', d.approved_by,
    'reason', d.reason,
    'rows', total,
    'tables', counts,
    'kept', kept,
    'recordsKeptUntil', to_char(until_all, 'YYYY-MM-DD'),
    'keptNote', 'Statutory records are kept in place, read-only, until the day shown for each, then deleted.'
  ) || coalesce(p_extra, '{}'::jsonb);
  txt := cert::text;
  sha := encode(sha256(convert_to(txt, 'UTF8')), 'hex');
  UPDATE company_deletions SET status = 'done', deleted_at = now(), certificate = txt, certificate_sha256 = sha WHERE id = d.id;
  RETURN jsonb_build_object('id', d.id, 'certificate', cert, 'sha256', sha);
END $$;
