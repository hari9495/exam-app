-- Row-Level Security: tenant isolation backstop for users and audit_logs.
-- Predicate returns true (row visible) when the session is flagged as
-- super-admin, OR when the row's organization id matches the session's
-- current org. With no session context set, both branches are false,
-- so queries return zero rows by default (secure by default).
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
