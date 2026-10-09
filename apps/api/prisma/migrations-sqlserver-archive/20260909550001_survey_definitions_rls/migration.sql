ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.survey_definitions,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.survey_definitions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.survey_definitions AFTER UPDATE;
