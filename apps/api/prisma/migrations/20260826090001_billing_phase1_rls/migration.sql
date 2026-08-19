-- Extend tenant isolation to billing_notices (separate migration: ALTER SECURITY POLICY
-- cannot share the CREATE TABLE batch). Same pattern as prior *_rls migrations.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.billing_notices,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.billing_notices AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.billing_notices AFTER UPDATE;
