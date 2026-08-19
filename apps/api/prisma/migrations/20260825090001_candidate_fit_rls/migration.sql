-- Extend the tenant isolation policy to the new table (same pattern as 20260823090001_interviews_rls).
-- Separate migration: ALTER SECURITY POLICY cannot run in the same batch as CREATE TABLE.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_fit_assessments,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_fit_assessments AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_fit_assessments AFTER UPDATE;
