ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.survey_responses,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.survey_responses AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.survey_responses AFTER UPDATE;
