-- The flat pipeline model is fully retired: every remaining api read/write of
-- PipelineEntry.stage has been migrated onto status/stage FKs (statusId -> PipelineStatus ->
-- PipelineStage), so the legacy column kept alive since 20260904090002_configurable_pipeline_seed
-- can now be dropped. No RLS bypass needed -- pure DDL, no cross-tenant DML.
ALTER TABLE [pipeline_entries] DROP COLUMN [stage];
