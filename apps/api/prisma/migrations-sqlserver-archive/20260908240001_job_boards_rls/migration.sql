ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_boards,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_boards AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_boards AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_board_publications,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_board_publications AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.job_board_publications AFTER UPDATE;
