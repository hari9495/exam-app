-- Tenant isolation, enforced by PostgreSQL itself (row-level security), plus least-privilege grants.
--
-- Roles (provisioned outside migrations -- docker/postgres/init/01-roles.sh, README "Database"):
--   * this migration runs as the schema owner (MIGRATION_DATABASE_URL);
--   * the app logs in as a NOSUPERUSER NOBYPASSRLS role that owns nothing and is a member of
--     the NOLOGIN group `app_runtime`, which is the only thing granted privileges below.
--
-- Context: TenantPrismaService.forTenant sets, with set_config(..., is_local => true) inside the
-- caller's transaction (so it can never outlive it on a pooled connection):
--   app.current_org               uuid of the acting tenant
--   app.is_super_admin            'on' for platform super-admin / system work
--   app.current_user_id           acting staff user (record visibility)
--   app.record_visibility_governed 'on' when the acting role is record-visibility governed
-- No context => every policy below is false => zero rows, and every write is rejected.

-- ---------------------------------------------------------------------------------------------
-- Grants: DML only, no DDL, nothing owned. The migrations ledger is not the app's business.
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
REVOKE ALL ON TABLE "_prisma_migrations" FROM app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- audit_logs is append-only for the app (replaces the SQL Server INSTEAD OF DELETE trigger).
-- FK ON DELETE SET NULL cascades still work: referential actions run as the table owner.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_logs" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Context readers. NULLIF: a transaction-local setting reverts to '' (not NULL) after commit,
-- and ''::uuid would raise instead of matching nothing. Inlinable SQL; wrapped in (SELECT ...)
-- at the call sites so each is evaluated once per statement, not once per row.
CREATE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.current_org', true), '')::uuid $$;
CREATE FUNCTION app_current_user_id() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;
CREATE FUNCTION app_is_super_admin() RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT current_setting('app.is_super_admin', true) IS NOT DISTINCT FROM 'on' $$;

-- ---------------------------------------------------------------------------------------------
-- Every table that has an organization_id column: ENABLE + FORCE (FORCE so the owner is bound
-- too), one policy covering SELECT/INSERT/UPDATE/DELETE. WITH CHECK rejects writing a row into
-- another tenant (INSERT, or UPDATE moving a row across tenants). Nullable organization_id
-- (platform-level users/audit rows) is visible to super-admin only, as before.
-- A new tenant table added later must get the same treatment; rls-isolation.e2e-spec.ts fails
-- the build if any organization_id table lacks forced RLS.
DO $$
DECLARE t regclass;
BEGIN
  FOR t IN
    SELECT c.oid::regclass
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Record-level visibility on pipeline_entries, ANDed with tenant_isolation (RESTRICTIVE).
-- Governs reads/updates/deletes only (WITH CHECK true), exactly like the SQL Server FILTER
-- predicate it replaces: a governed recruiter sees an entry only when the org has the feature
-- on and the entry is unassigned, assigned to them, or assigned to one of their groups.
CREATE POLICY record_visibility ON "pipeline_entries" AS RESTRICTIVE
  USING (
    (SELECT app_is_super_admin())
    OR current_setting('app.record_visibility_governed', true) IS DISTINCT FROM 'on'
    OR NOT EXISTS (
      SELECT 1 FROM "organizations" o
      WHERE o.id = "pipeline_entries".organization_id AND o.record_visibility_enabled
    )
    OR (assigned_user_id IS NULL AND assigned_group_id IS NULL)
    OR assigned_user_id = (SELECT app_current_user_id())
    OR assigned_group_id IN (
      SELECT gm.group_id FROM "user_group_members" gm WHERE gm.user_id = (SELECT app_current_user_id())
    )
  )
  WITH CHECK (true);
