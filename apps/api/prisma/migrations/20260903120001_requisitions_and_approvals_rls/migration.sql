-- Extend tenant isolation to the two org-scoped approval tables
-- (approval_chain_steps/approval_decisions have no organization_id column --
-- they're scoped transitively via their parent chain_id/request_id FK --
-- so they get no direct predicate, same as e.g. pipeline_feedback's sibling
-- non-org-scoped child tables elsewhere in this schema). Separate migration:
-- ALTER SECURITY POLICY cannot share a CREATE TABLE batch. Reuses the
-- existing dbo.fn_tenant_access_predicate function unchanged.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.approval_chains,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.approval_chains AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.approval_chains AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.approval_requests,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.approval_requests AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.approval_requests AFTER UPDATE;
