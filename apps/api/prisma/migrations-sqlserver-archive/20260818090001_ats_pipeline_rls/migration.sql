-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover the four pipeline tables
-- added in 20260818090000_ats_pipeline. Reuses the existing
-- dbo.fn_tenant_access_predicate function unchanged; this adds predicates to
-- the existing policy, it does not create a new policy or function (same
-- pattern as 20260707150001_candidates_rls). Split into its own migration
-- (rather than combined with the CreateTable statements) because SQL Server
-- cannot resolve ALTER SECURITY POLICY ... ON dbo.jobs in the same batch as
-- the CREATE TABLE that defines dbo.jobs.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.jobs,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.jobs AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.jobs AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_entries,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_entries AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_entries AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_feedback,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_feedback AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_feedback AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_exams,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_exams AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_exams AFTER UPDATE;
