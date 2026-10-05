-- Extend the existing tenant isolation policy to cover the two candidate-SMS
-- tables. Reuses dbo.fn_tenant_access_predicate unchanged. Separate migration
-- because ALTER SECURITY POLICY cannot run in the same batch as the CREATE TABLE.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_sms_templates,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_sms_templates AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_sms_templates AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_sms,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_sms AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_sms AFTER UPDATE;
