ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.drip_campaigns,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.drip_campaigns AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.drip_campaigns AFTER UPDATE;
