-- Drop the tenant-isolation security policy so the columns it depends on
-- (users.organization_id, audit_logs.organization_id) can have their type
-- corrected from NVARCHAR(1000) to UNIQUEIDENTIFIER in a later migration.
-- SQL Server refuses ALTER COLUMN on a column referenced by an active
-- security policy predicate (error 5074), so the policy must be dropped
-- first and recreated afterward (see 20260707110005_tenant_rls_policy).
DROP SECURITY POLICY dbo.TenantAccessPolicy;
