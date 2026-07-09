-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover dbo.tags. Reuses
-- the existing dbo.fn_tenant_access_predicate function unchanged; this
-- adds predicates to the existing policy, it does not create a new
-- policy or function. The policy is already WITH (STATE = ON), so no
-- state change is needed here. dbo.question_tags is deliberately NOT
-- added here -- it has no organization_id column, matching every other
-- join table in this schema (exam_section_questions, question_options);
-- tenant isolation for it is enforced at the application layer only,
-- by always reaching it through an already-tenant-filtered Question row.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags AFTER UPDATE;
