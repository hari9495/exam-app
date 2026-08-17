-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover dbo.candidate_profiles, the only
-- new table added in 20260819090000_candidate_experience. dbo.jobs and
-- dbo.pipeline_entries already have policies from 20260818090001_ats_pipeline_rls, so
-- they are not re-added here. Reuses the existing dbo.fn_tenant_access_predicate
-- function unchanged; this adds predicates to the existing policy, it does not create a
-- new policy or function. Split into its own migration (rather than combined with the
-- CreateTable statement) because SQL Server cannot resolve ALTER SECURITY POLICY ... ON
-- dbo.candidate_profiles in the same batch as the CREATE TABLE that defines it.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_profiles,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_profiles AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_profiles AFTER UPDATE;
