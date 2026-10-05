ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_email_batches,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_email_batches AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_email_batches AFTER UPDATE;
