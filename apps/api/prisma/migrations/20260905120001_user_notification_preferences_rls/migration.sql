-- Extend tenant isolation to user_notification_preferences (separate migration: ALTER SECURITY POLICY
-- cannot share a CREATE TABLE batch). Per-recipient filtering is enforced in the service layer.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_notification_preferences,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_notification_preferences AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.user_notification_preferences AFTER UPDATE;
