-- Extend tenant isolation to the integrations tables (separate migration:
-- ALTER SECURITY POLICY cannot share a CREATE TABLE batch).
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_integrations,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_integrations AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.org_integrations AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.integration_deliveries,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.integration_deliveries AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.integration_deliveries AFTER UPDATE;
