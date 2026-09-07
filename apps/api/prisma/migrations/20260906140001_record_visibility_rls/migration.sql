-- Record-level visibility (Zoho #18-B): hides pipeline_entries rows not assigned to the current
-- recruiter (or their group) when the owning organization has record_visibility_enabled = 1 (T1)
-- and the request is flagged governed (T2 session-context key app_record_visibility_governed).
-- Super admins and ungoverned requests always pass.
--
-- CONTROLLER RULING #1 (overrides the original spec's "CREATE SECURITY POLICY
-- dbo.RecordVisibilityPolicy" design): SQL Server allows only ONE enabled security policy per
-- table (error 33264), and pipeline_entries is already governed by the enabled
-- dbo.TenantAccessPolicy (20260818090001_ats_pipeline_rls). So this predicate must be registered
-- against that EXISTING policy instead of a second policy object.
--
-- SECOND ENGINE RESTRICTION DISCOVERED HERE (not covered by ruling #1): SQL Server also allows
-- only ONE FILTER predicate per table within a single security policy (error 33262: "A FILTER
-- predicate for the same operation has already been defined on table 'dbo.pipeline_entries' in
-- the security policy 'dbo.TenantAccessPolicy'"), confirmed by actually attempting
-- `ALTER SECURITY POLICY dbo.TenantAccessPolicy ADD FILTER PREDICATE
-- dbo.fn_record_visibility_predicate(...) ON dbo.pipeline_entries` against the live dev database
-- (pipeline_entries already carries a FILTER predicate using dbo.fn_tenant_access_predicate). A
-- second, independently-parameterized FILTER predicate cannot simply be ADDed alongside it.
--
-- Resolution: keep dbo.fn_record_visibility_predicate exactly as specified (a standalone,
-- reusable, unit-testable record-visibility check), and keep dbo.fn_tenant_access_predicate
-- completely unmodified (its definition is untouched, and it remains the FILTER/BLOCK predicate
-- for every other tenant-scoped table, unchanged). Introduce ONE new composing function,
-- dbo.fn_pipeline_entries_combined_predicate, whose body does nothing but call both existing
-- predicate functions via EXISTS and AND their results -- this is the only FILTER predicate a
-- security policy can hold per table, so it is what gets registered on pipeline_entries. Because
-- it ANDs in dbo.fn_tenant_access_predicate unchanged, tenant isolation for pipeline_entries SELECT
-- is preserved exactly (net effect: same rows as before, further narrowed by record-visibility) --
-- it is not weakened. Only the FILTER predicate *registration* on this one table changes (from
-- referencing fn_tenant_access_predicate directly to referencing the new composing function);
-- pipeline_entries' BLOCK predicates (AFTER INSERT / AFTER UPDATE, still fn_tenant_access_predicate)
-- are untouched, and FILTER predicates on every other table in TenantAccessPolicy are untouched.
--
-- Batch separation: CREATE FUNCTION must be the sole/first statement in its batch, and Prisma's
-- SQL Server connector does not support the sqlcmd `GO` batch separator (established in this repo
-- by 20260904090003_comms_trigger_stage). Deferring each CREATE FUNCTION into its own dynamic-SQL
-- batch via EXEC(N'...') is this repo's established technique for that constraint. ALTER SECURITY
-- POLICY is not batch-restricted in general (20260906100001_user_groups_rls runs two ALTER
-- SECURITY POLICY statements back-to-back with no separator when they don't conflict) -- but the
-- DROP/ADD pair below specifically needs the same EXEC deferral; see the comment further down.
EXEC(N'CREATE FUNCTION dbo.fn_record_visibility_predicate(
  @OrgId          UNIQUEIDENTIFIER,
  @AssignedUser   UNIQUEIDENTIFIER,
  @AssignedGroup  UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS fn_result
WHERE
  CONVERT(BIT, ISNULL(SESSION_CONTEXT(N''app_is_super_admin''), 0)) = 1
  OR CONVERT(BIT, ISNULL(SESSION_CONTEXT(N''app_record_visibility_governed''), 0)) = 0
  OR NOT EXISTS (
       SELECT 1 FROM dbo.organizations o
       WHERE o.id = @OrgId AND o.record_visibility_enabled = 1
     )
  OR @AssignedUser = TRY_CONVERT(UNIQUEIDENTIFIER, SESSION_CONTEXT(N''app_current_user''))
  OR @AssignedGroup IN (
       SELECT gm.group_id FROM dbo.user_group_members gm
       WHERE gm.user_id = TRY_CONVERT(UNIQUEIDENTIFIER, SESSION_CONTEXT(N''app_current_user''))
     )
  OR (@AssignedUser IS NULL AND @AssignedGroup IS NULL);');

EXEC(N'CREATE FUNCTION dbo.fn_pipeline_entries_combined_predicate(
  @OrgId          UNIQUEIDENTIFIER,
  @AssignedUser   UNIQUEIDENTIFIER,
  @AssignedGroup  UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS fn_result
WHERE EXISTS (SELECT 1 FROM dbo.fn_tenant_access_predicate(@OrgId))
  AND EXISTS (SELECT 1 FROM dbo.fn_record_visibility_predicate(@OrgId, @AssignedUser, @AssignedGroup));');

-- The DROP and the ADD must each run in their own dynamic-SQL batch too: SQL Server validates the
-- "one FILTER predicate per table" constraint against catalog state resolved at batch-compile
-- time, not against the mid-batch state after a same-batch DROP has executed (confirmed by
-- observing the DROP+ADD pair still fail with error 33262 as plain back-to-back statements, and
-- succeed once each is run in its own EXEC batch) -- the same category of compile-vs-runtime
-- ordering issue 20260904090003_comms_trigger_stage works around for column resolution.
EXEC(N'ALTER SECURITY POLICY dbo.TenantAccessPolicy DROP FILTER PREDICATE ON dbo.pipeline_entries;');

EXEC(N'ALTER SECURITY POLICY dbo.TenantAccessPolicy
  ADD FILTER PREDICATE dbo.fn_pipeline_entries_combined_predicate(
    organization_id, assigned_user_id, assigned_group_id
  ) ON dbo.pipeline_entries;');
