ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_definitions,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_definitions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_definitions AFTER UPDATE;

ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_values,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_values AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_values AFTER UPDATE;
