ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agencies,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agencies AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agencies AFTER UPDATE;

ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agency_jobs,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agency_jobs AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agency_jobs AFTER UPDATE;

ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agency_submissions,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agency_submissions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.agency_submissions AFTER UPDATE;
