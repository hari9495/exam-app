-- Extend the tenant isolation policy to cover org_role_permissions. Reuses
-- dbo.fn_tenant_access_predicate unchanged. Separate migration because ALTER SECURITY POLICY
-- cannot run in the same batch as the CREATE TABLE above.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_role_permissions,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_role_permissions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_role_permissions AFTER UPDATE;
