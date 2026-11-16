-- Answer 1882: after a closed company's kept days (account.closure.keep_days, 30), YukthiX staff delete its data, one
-- company at a time. One staff member asks, a second confirms (both with the security key); every step is audited and a
-- deletion certificate is issued. The record of the deletion outlives the company (no foreign key to organizations).
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "company_deletions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "company_name" VARCHAR(1000) NOT NULL,
    "company_slug" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'requested',
    "reason" VARCHAR(500) NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "certificate" TEXT,
    "certificate_sha256" CHAR(64),
    CONSTRAINT "company_deletions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_deletions_status_check" CHECK ("status" IN ('requested', 'withdrawn', 'done')),
    -- The second person is never the one who asked.
    CONSTRAINT "company_deletions_four_eyes" CHECK ("approved_by" IS NULL OR "approved_by" <> "requested_by"),
    CONSTRAINT "company_deletions_done_check" CHECK (("status" = 'done') = ("certificate" IS NOT NULL AND "approved_by" IS NOT NULL AND "deleted_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "company_deletions_one_open" ON "company_deletions" ("organization_id") WHERE "status" = 'requested';
ALTER TABLE "company_deletions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY company_deletions_platform ON "company_deletions" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "company_deletions" FROM app_runtime;

/*
 * Deletes one closed company's rows, and only its rows: every statement is "WHERE organization_id = p_org" on a table
 * that has that column, then the organizations row itself. The row-level policies are satisfied for this company alone
 * (its id, its legal entities for the pay guards). Tables are emptied in passes, as foreign keys allow, keeping
 * employments to the end (the pay guards look them up). If any row of the company is left, it raises and nothing is
 * deleted. Returns the rows deleted per table.
 */
CREATE OR REPLACE FUNCTION purge_company(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text;
  n bigint;
  pass int;
  progress boolean;
  counts jsonb := '{}'::jsonb;
  last_error jsonb := '{}'::jsonb;
  left_over text := '';
  tables text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org AND lifecycle = 'closed') THEN
    RAISE EXCEPTION 'Only a closed company can be deleted.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('app.current_org', p_org::text, true);
  PERFORM set_config('app.is_super_admin', 'on', true);
  PERFORM set_config('app.sd_system', 'on', true);
  PERFORM set_config('app.lifecycle_confidential', 'on', true);
  PERFORM set_config('app.record_visibility_governed', 'off', true);
  PERFORM set_config('app.portal_person_id', '', true);
  PERFORM set_config('app.consultant_portal', '', true);
  PERFORM set_config('app.pay_entities', coalesce((SELECT '{' || string_agg(id::text, ',') || '}' FROM legal_entities WHERE organization_id = p_org), '{}'), true);
  IF EXISTS (SELECT 1 FROM audit_legal_holds WHERE organization_id = p_org AND released_at IS NULL AND to_at > now()) THEN
    RAISE EXCEPTION 'A legal hold is in place for this company.' USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(c.table_name::text ORDER BY c.table_name) INTO tables
  FROM information_schema.columns c
  JOIN information_schema.tables x ON x.table_schema = c.table_schema AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND c.table_name NOT IN ('company_deletions');

  FOR pass IN 1..60 LOOP
    progress := false;
    FOREACH t IN ARRAY tables LOOP
      -- Employments last: the pay guards on payroll rows check them.
      CONTINUE WHEN t = 'employments' AND pass < 3;
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE organization_id = $1', t) USING p_org;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          progress := true;
          counts := jsonb_set(counts, ARRAY[t], to_jsonb(coalesce((counts ->> t)::bigint, 0) + n));
        END IF;
      EXCEPTION WHEN OTHERS THEN
        last_error := jsonb_set(last_error, ARRAY[t], to_jsonb(SQLERRM));
      END;
    END LOOP;
    EXIT WHEN NOT progress AND pass >= 3;
  END LOOP;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE organization_id = $1', t) INTO n USING p_org;
    IF n > 0 THEN left_over := left_over || format('%s (%s rows: %s); ', t, n, coalesce(last_error ->> t, 'still referenced')); END IF;
  END LOOP;
  IF left_over <> '' THEN
    RAISE EXCEPTION 'Not deleted, nothing changed: %', left(left_over, 1500) USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM organizations WHERE id = p_org;
  RETURN counts;
END $$;
REVOKE ALL ON FUNCTION purge_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_company(uuid) TO app_runtime;
