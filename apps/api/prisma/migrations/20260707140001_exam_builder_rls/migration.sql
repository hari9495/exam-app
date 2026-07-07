-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover dbo.exams. Reuses
-- the existing dbo.fn_tenant_access_predicate function unchanged; this
-- adds predicates to the existing policy, it does not create a new
-- policy or function. The policy is already WITH (STATE = ON), so no
-- state change is needed here.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.exams,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.exams AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.exams AFTER UPDATE;
