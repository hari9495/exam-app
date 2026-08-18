-- Extend the tenant isolation policy to the three interview tables (same pattern
-- as 20260822090001_offers_rls). Separate migration: ALTER SECURITY POLICY
-- cannot run in the same batch as CREATE TABLE.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interviews,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interviews AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interviews AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interview_slots,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interview_slots AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interview_slots AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interview_panelists,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interview_panelists AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.interview_panelists AFTER UPDATE;
