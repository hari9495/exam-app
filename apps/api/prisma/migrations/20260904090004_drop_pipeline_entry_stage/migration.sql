-- The flat pipeline model is fully retired: every remaining api read/write of
-- PipelineEntry.stage has been migrated onto status/stage FKs (statusId -> PipelineStatus ->
-- PipelineStage), so the legacy column kept alive since 20260904090002_configurable_pipeline_seed
-- can now be dropped. No RLS bypass needed -- pure DDL, no cross-tenant DML.

-- The column carries a DEFAULT constraint (from @default("applied") in the init schema); SQL Server
-- refuses to drop a column while a constraint depends on it (error 5074). Drop that default
-- constraint first, looked up by name so this is robust to whatever the constraint was named.
DECLARE @df NVARCHAR(200);
SELECT @df = dc.name
FROM sys.default_constraints dc
JOIN sys.columns col ON col.object_id = dc.parent_object_id AND col.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('[pipeline_entries]') AND col.name = 'stage';
IF @df IS NOT NULL EXEC('ALTER TABLE [pipeline_entries] DROP CONSTRAINT [' + @df + ']');

ALTER TABLE [pipeline_entries] DROP COLUMN [stage];
