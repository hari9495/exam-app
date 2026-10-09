ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_groups,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_groups AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_groups AFTER UPDATE;

ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_group_members,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_group_members AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_group_members AFTER UPDATE;
