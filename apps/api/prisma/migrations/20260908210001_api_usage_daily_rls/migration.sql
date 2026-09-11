ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.api_usage_daily,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.api_usage_daily AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.api_usage_daily AFTER UPDATE;
