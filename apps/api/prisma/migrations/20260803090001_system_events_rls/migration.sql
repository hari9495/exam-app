-- Bind dbo.system_events to the existing tenant isolation policy. Separate migration file
-- from the CREATE TABLE on purpose: statements referencing objects created earlier in the
-- SAME migration file fail at batch-compile time in this environment (see the split of
-- 20260723090000/090001 for the precedent). Org-admins see only their org's events;
-- super-admin context sees all, including NULL-org (platform-level) events.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.system_events,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.system_events AFTER INSERT;
