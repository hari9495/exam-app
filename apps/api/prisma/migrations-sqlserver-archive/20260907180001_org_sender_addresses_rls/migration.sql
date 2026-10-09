ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_sender_addresses,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_sender_addresses AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_sender_addresses AFTER UPDATE;
