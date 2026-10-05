-- Recreate the tenant-access predicate function (dropped in
-- 20260707110002) now that users.organization_id and
-- audit_logs.organization_id are UNIQUEIDENTIFIER columns. Definition is
-- unchanged from the original 20260707104326_tenant_rls_function
-- migration.
CREATE FUNCTION dbo.fn_tenant_access_predicate(@OrgId UNIQUEIDENTIFIER)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS fn_result
WHERE (
  CONVERT(BIT, ISNULL(SESSION_CONTEXT(N'app_is_super_admin'), 0)) = 1
)
OR (
  @OrgId IS NOT NULL
  AND TRY_CONVERT(UNIQUEIDENTIFIER, SESSION_CONTEXT(N'app_current_org')) = @OrgId
);
