CREATE SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.audit_logs,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.audit_logs AFTER INSERT
WITH (STATE = ON);
