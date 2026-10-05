-- Extend the tenant isolation policy to the two offer tables (same pattern as
-- 20260821090001_candidate_emails_rls). Separate migration: ALTER SECURITY POLICY
-- cannot run in the same batch as CREATE TABLE.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offers,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offers AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offers AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offer_templates,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offer_templates AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.offer_templates AFTER UPDATE;
