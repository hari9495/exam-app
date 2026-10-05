-- Extend the tenant isolation security policy (see 20260707110005_tenant_rls_policy)
-- to also cover the three pipeline config tables added in
-- 20260904090000_configurable_pipeline_tables. Reuses the existing
-- dbo.fn_tenant_access_predicate function unchanged; this adds predicates to
-- the existing policy, it does not create a new policy or function (same
-- pattern as 20260818090001_ats_pipeline_rls). Split into its own migration
-- (rather than combined with the CREATE TABLE statements) because SQL Server
-- cannot resolve ALTER SECURITY POLICY ... ON dbo.pipelines in the same batch
-- as the CREATE TABLE that defines dbo.pipelines.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipelines,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipelines AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipelines AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_stages,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_stages AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_stages AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_statuses,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_statuses AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.pipeline_statuses AFTER UPDATE;
