-- Answer 1976: when a deleted company's kept statutory records reach their day, a nightly job removes them, group by
-- group (the audit years may be longer than pay or filings), then the company and its people once nothing else is
-- left, and issues a second certificate for each removal. The app role never gains the power to remove kept records
-- early: only release_company_records (SECURITY DEFINER, owned by the table owner) may, and it refuses unless the
-- day has passed, no legal hold is active, and the company is closed and was purged.
SELECT set_config('app.is_super_admin', 'on', true);

/*
 * The kept groups of a purged company, each with its own day, and the second certificate once removed. Groups:
 * audit, pay, filings (company_statutory_tables) and company (the company row, its people and the rows the kept
 * records referred to; its day is organizations.records_kept_until). Filled from the deletion certificate the first
 * time the release runs. No foreign key: the record of the removal outlives the company.
 */
CREATE TABLE "company_record_groups" (
    "organization_id" UUID NOT NULL,
    "record_group" VARCHAR(12) NOT NULL,
    "kept_until" DATE NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "rows" BIGINT,
    "certificate" TEXT,
    "certificate_sha256" CHAR(64),
    CONSTRAINT "company_record_groups_pkey" PRIMARY KEY ("organization_id", "record_group"),
    CONSTRAINT "company_record_groups_group_check" CHECK ("record_group" IN ('audit', 'pay', 'filings', 'company')),
    CONSTRAINT "company_record_groups_released_check" CHECK (("released_at" IS NULL) = ("certificate" IS NULL) AND ("certificate" IS NULL) = ("certificate_sha256" IS NULL))
);
ALTER TABLE "company_record_groups" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY company_record_groups_platform ON "company_record_groups" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
-- The app reads; only release_company_records (the owner) writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "company_record_groups" FROM app_runtime;
GRANT SELECT ON TABLE "company_record_groups" TO app_runtime;

/*
 * The kept groups and their days are written when purge_company marks a deletion done, in its own transaction, from
 * the certificate it has just written: never later from a row the app could change. Not SECURITY DEFINER: run by the
 * app directly (marking a deletion done by hand), the insert is refused, as the app may not write the groups.
 */
CREATE OR REPLACE FUNCTION company_record_groups_seed() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    INSERT INTO company_record_groups (organization_id, record_group, kept_until)
    SELECT NEW.organization_id, s.record_group, max((k ->> 'keptUntil')::date)
    FROM jsonb_array_elements(NEW.certificate::jsonb -> 'kept') k
    JOIN company_statutory_tables() s ON s.table_name = k ->> 'table'
    GROUP BY s.record_group
    ON CONFLICT DO NOTHING;
    INSERT INTO company_record_groups (organization_id, record_group, kept_until)
    SELECT o.id, 'company', o.records_kept_until::date FROM organizations o WHERE o.id = NEW.organization_id AND o.records_kept_until IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER company_record_groups_seed AFTER INSERT OR UPDATE OF status ON "company_deletions" FOR EACH ROW EXECUTE FUNCTION company_record_groups_seed();

-- Companies already deleted before this migration: their groups, from their certificates.
INSERT INTO company_record_groups (organization_id, record_group, kept_until)
SELECT d.organization_id, s.record_group, max((k ->> 'keptUntil')::date)
FROM company_deletions d
CROSS JOIN LATERAL jsonb_array_elements(d.certificate::jsonb -> 'kept') k
JOIN company_statutory_tables() s ON s.table_name = k ->> 'table'
WHERE d.status = 'done'
GROUP BY d.organization_id, s.record_group
ON CONFLICT DO NOTHING;
INSERT INTO company_record_groups (organization_id, record_group, kept_until)
SELECT o.id, 'company', o.records_kept_until::date FROM organizations o WHERE o.records_kept_until IS NOT NULL
ON CONFLICT DO NOTHING;

/*
 * The removal permits: release_company_records writes one row for its own transaction and company, and the read-only
 * rule lets a removal through only with that row. Owner only: the app can neither read nor write it, so setting
 * app.retention_release and calling some other owner function is not enough.
 */
CREATE TABLE "retention_release_grants" (
    "txid" BIGINT NOT NULL,
    "organization_id" UUID NOT NULL,
    CONSTRAINT "retention_release_grants_pkey" PRIMARY KEY ("txid", "organization_id")
);
REVOKE ALL ON TABLE "retention_release_grants" FROM PUBLIC;
REVOKE ALL ON TABLE "retention_release_grants" FROM app_runtime;

/*
 * Kept records are read-only until the company's records_kept_until. Two ways past it, both needing
 * app.retention_release: a person connected as the table's owner (operations), or code running as the owner (a
 * SECURITY DEFINER function of the owner) holding a permit for this transaction and company (release_company_records).
 */
CREATE OR REPLACE FUNCTION company_records_read_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  until timestamptz;
  owner_name text;
  org uuid;
BEGIN
  IF current_setting('app.retention_release', true) = 'on' THEN
    owner_name := (SELECT pg_get_userbyid(c.relowner)::text FROM pg_class c WHERE c.oid = TG_RELID);
    IF session_user::text = owner_name THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    -- Only the owner can read the permits; the app never gets this far.
    IF current_user::text = owner_name THEN
      IF TG_TABLE_NAME = 'organizations' THEN org := OLD.id; ELSE org := OLD.organization_id; END IF;
      IF EXISTS (SELECT 1 FROM retention_release_grants g WHERE g.txid = txid_current() AND g.organization_id = org) THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'organizations' THEN
    until := OLD.records_kept_until;
  ELSE
    SELECT o.records_kept_until INTO until FROM organizations o WHERE o.id = OLD.organization_id;
  END IF;
  IF until IS NOT NULL AND until > now() THEN
    RAISE EXCEPTION 'This closed company''s statutory records are kept read-only until %.', to_char(until, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

/*
 * Removes a purged company's kept records whose day has passed, one group at a time, and issues a certificate for
 * each (what was removed, when, and its SHA-256). It refuses unless the company is closed and was purged (a done
 * deletion, records_kept_until set), no legal hold is active, and at least one group's day has passed. A group goes
 * whole or not at all: rows another kept group still needs make it wait for a later night. The company group (the
 * company row, its people and the rows the kept records referred to) goes last, once records_kept_until has passed
 * and every other group is gone. Safe to run twice at once: the company row is locked and a removed group stays
 * removed. Returns {released: [{group, rows, sha256}], waiting: [group], companyRemoved}.
 */
CREATE FUNCTION release_company_records(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record;
  d record;
  g record;
  t text;
  n bigint;
  pass int;
  progress boolean;
  tables text[];
  counts jsonb;
  total bigint;
  left_over text;
  cert jsonb;
  txt text;
  sha text;
  released jsonb := '[]'::jsonb;
  waiting jsonb := '[]'::jsonb;
  removed boolean := false;
  next_day date;
BEGIN
  PERFORM set_config('app.current_org', p_org::text, true);
  PERFORM set_config('app.is_super_admin', 'on', true);
  PERFORM set_config('app.sd_system', 'on', true);
  PERFORM set_config('app.lifecycle_confidential', 'on', true);
  PERFORM set_config('app.record_visibility_governed', 'off', true);
  PERFORM set_config('app.portal_person_id', '', true);
  PERFORM set_config('app.consultant_portal', '', true);
  PERFORM set_config('app.pay_entities', coalesce((SELECT '{' || string_agg(id::text, ',') || '}' FROM legal_entities WHERE organization_id = p_org), '{}'), true);

  SELECT id, name, slug, lifecycle, records_kept_until INTO o FROM organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such company, or its kept records are already removed.' USING ERRCODE = 'P0001';
  END IF;
  IF o.lifecycle <> 'closed' THEN
    RAISE EXCEPTION 'Only a closed company''s kept records can be removed.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO d FROM company_deletions WHERE organization_id = p_org AND status = 'done' ORDER BY deleted_at ASC LIMIT 1;
  IF o.records_kept_until IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'This company''s data was not deleted: nothing is kept to remove.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_legal_holds WHERE organization_id = p_org AND released_at IS NULL AND to_at > now()) THEN
    RAISE EXCEPTION 'A legal hold is in place for this company: its kept records stay.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM company_record_groups WHERE organization_id = p_org) THEN
    RAISE EXCEPTION 'This company''s data was not deleted: nothing is kept to remove.' USING ERRCODE = 'P0001';
  END IF;

  SELECT min(kept_until) INTO next_day FROM company_record_groups WHERE organization_id = p_org AND released_at IS NULL;
  IF next_day IS NULL OR next_day >= current_date THEN
    RAISE EXCEPTION 'Nothing is due: the kept records stay until %.', coalesce(to_char(next_day, 'YYYY-MM-DD'), 'removed') USING ERRCODE = 'P0001';
  END IF;

  -- The permit for this transaction and company (see company_records_read_only), and the audit log's own gate.
  INSERT INTO retention_release_grants (txid, organization_id) VALUES (txid_current(), p_org) ON CONFLICT DO NOTHING;
  PERFORM set_config('app.retention_release', 'on', true);
  PERFORM set_config('app.audit_archive', 'on', true);

  FOR g IN SELECT * FROM company_record_groups WHERE organization_id = p_org AND released_at IS NULL AND kept_until < current_date
           ORDER BY (record_group = 'company'), record_group LOOP
    IF g.record_group = 'company' THEN
      -- Last: only when every other group is gone and the company's own day has passed.
      IF o.records_kept_until >= now() OR EXISTS (SELECT 1 FROM company_record_groups WHERE organization_id = p_org AND record_group <> 'company' AND released_at IS NULL) THEN
        waiting := waiting || to_jsonb(g.record_group);
        CONTINUE;
      END IF;
      SELECT array_agg(DISTINCT r.table_name) INTO tables FROM company_retained_tables() r WHERE r.record_group = 'referenced' AND r.table_name <> 'organizations';
    ELSE
      SELECT array_agg(s.table_name) INTO tables FROM company_statutory_tables() s WHERE s.record_group = g.record_group;
    END IF;
    counts := '{}'::jsonb;
    total := 0;
    BEGIN
      FOR pass IN 1..30 LOOP
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
            NULL; -- still referenced: tried again in the next pass
          END;
        END LOOP;
        EXIT WHEN NOT progress;
      END LOOP;
      left_over := '';
      FOREACH t IN ARRAY tables LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE organization_id = $1', t) INTO n USING p_org;
        IF n > 0 THEN left_over := left_over || t || ' '; END IF;
      END LOOP;
      IF g.record_group = 'company' AND left_over = '' THEN
        BEGIN
          DELETE FROM organizations WHERE id = p_org;
          counts := jsonb_set(counts, ARRAY['organizations'], to_jsonb(1));
          total := total + 1;
        EXCEPTION WHEN OTHERS THEN
          left_over := 'organizations';
        END;
      END IF;
      IF left_over <> '' THEN
        RAISE EXCEPTION 'waiting' USING ERRCODE = 'P0002';
      END IF;
    EXCEPTION WHEN SQLSTATE 'P0002' THEN
      -- Rows another kept group still needs: this group stays whole until a later night.
      waiting := waiting || to_jsonb(g.record_group);
      CONTINUE;
    END;

    cert := jsonb_build_object(
      'title', 'YukthiX kept records removal certificate',
      'company', jsonb_build_object('id', p_org, 'name', o.name, 'code', o.slug),
      'deletionCertificateSha256', d.certificate_sha256,
      'group', g.record_group,
      'keptUntil', to_char(g.kept_until, 'YYYY-MM-DD'),
      'removedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'rows', total,
      'tables', counts,
      'note', CASE WHEN g.record_group = 'company'
        THEN 'The company, its people and the rows its kept records referred to are removed; nothing of the company is left.'
        ELSE 'These kept statutory records reached the end of their legal period and are removed.' END
    );
    txt := cert::text;
    sha := encode(sha256(convert_to(txt, 'UTF8')), 'hex');
    UPDATE company_record_groups SET released_at = now(), rows = total, certificate = txt, certificate_sha256 = sha
    WHERE organization_id = p_org AND record_group = g.record_group;
    released := released || jsonb_build_object('group', g.record_group, 'rows', total, 'sha256', sha);
    removed := removed OR g.record_group = 'company';
  END LOOP;

  DELETE FROM retention_release_grants WHERE txid = txid_current() AND organization_id = p_org;
  RETURN jsonb_build_object('released', released, 'waiting', waiting, 'companyRemoved', removed);
END $$;
REVOKE ALL ON FUNCTION release_company_records(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION release_company_records(uuid) TO app_runtime;
