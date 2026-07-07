-- Drop the predicate function now that no security policy references it.
-- It will be recreated (identical definition) in 20260707110004 once the
-- UUID columns it's applied against have been corrected to
-- UNIQUEIDENTIFIER, matching its @OrgId UNIQUEIDENTIFIER parameter type.
DROP FUNCTION dbo.fn_tenant_access_predicate;
