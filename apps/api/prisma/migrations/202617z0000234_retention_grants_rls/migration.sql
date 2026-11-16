-- Answer 1976 follow-up: every table with organization_id has row-level security forced with a policy (the RLS
-- guard). The removal permits are owner only (no app grant); release_company_records runs as a platform super admin.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "retention_release_grants" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_release_grants_platform ON "retention_release_grants" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
