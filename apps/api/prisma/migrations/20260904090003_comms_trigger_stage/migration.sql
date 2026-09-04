-- Candidate-email template triggers move from a flat stage-name string (trigger_event) to a
-- PipelineStage FK (trigger_stage_id), matching the configurable per-org pipeline stages seeded
-- by 20260904090002_configurable_pipeline_seed.
ALTER TABLE [candidate_email_templates] ADD [trigger_stage_id] UNIQUEIDENTIFIER NULL;

-- Backfill: join the old trigger_event name to the org's DEFAULT pipeline's stage of that name
-- ('rejected' included -- it was stored as a trigger_event value even though it's a stage
-- category elsewhere, not just a name, so this matches it like any other stage name).
-- candidate_email_templates and pipeline_stages both carry tenant FILTER + BLOCK PREDICATE
-- security policies (dbo.fn_tenant_access_predicate); the migration connection has no session
-- context, unlike app requests, so this cross-tenant UPDATE...JOIN would be blocked -- bypass RLS
-- the same way 20260904090002_configurable_pipeline_seed does.
EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1;

UPDATE t SET t.trigger_stage_id = st.id
FROM [candidate_email_templates] t
JOIN [pipelines] p ON p.organization_id = t.organization_id AND p.is_default = 1
JOIN [pipeline_stages] st ON st.pipeline_id = p.id AND st.name = t.trigger_event
WHERE t.trigger_event IS NOT NULL;

EXEC sp_set_session_context @key=N'app_is_super_admin', @value=0;

ALTER TABLE [candidate_email_templates] DROP COLUMN [trigger_event];
