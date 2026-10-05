ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.permission_profiles,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.permission_profiles AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.permission_profiles AFTER UPDATE;
