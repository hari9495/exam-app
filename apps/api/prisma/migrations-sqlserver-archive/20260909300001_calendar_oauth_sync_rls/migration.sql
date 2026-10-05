-- Extend the tenant isolation policy to cover calendar_connections. Reuses
-- dbo.fn_tenant_access_predicate unchanged. Separate migration because ALTER SECURITY
-- POLICY cannot run in the same batch as the CREATE TABLE above.
--
-- calendar_oauth_states is intentionally omitted: it is looked up by state_hash in the
-- OAuth callback, which runs without a tenant context (no JWT), same as sso_login_codes.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.calendar_connections,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.calendar_connections AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.calendar_connections AFTER UPDATE;
