ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.referrals,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.referrals AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.referrals AFTER UPDATE;
