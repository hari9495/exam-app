-- Recreate the tenant isolation security policy (dropped in
-- 20260707110001), now binding against the corrected UNIQUEIDENTIFIER
-- organization_id columns. Definition is unchanged from the original
-- 20260707104327_tenant_rls_policy migration.
CREATE SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.audit_logs,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.audit_logs AFTER INSERT
WITH (STATE = ON);
