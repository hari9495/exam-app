-- Backfill global_stage for every existing candidate from their pipeline entries, mirroring
-- deriveGlobalStage's precedence exactly: live (non-archived) hired > offered > engaged(active);
-- else any archived entry -> available; else live rejected -> rejected; else has an inbound
-- candidate_emails row -> in_review; else new. ('live' = archived_at IS NULL.)
--
-- candidates/pipeline_entries/pipeline_statuses/pipeline_stages/candidate_emails all carry tenant
-- FILTER + BLOCK PREDICATE security policies (dbo.fn_tenant_access_predicate). The migration
-- connection has no session context, unlike app requests, so this cross-tenant UPDATE would be
-- blocked -- bypass RLS the same way 20260904090002_configurable_pipeline_seed does.
EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1;

UPDATE c SET c.global_stage =
  CASE
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e JOIN pipeline_statuses su ON su.id=e.status_id JOIN pipeline_stages st ON st.id=su.stage_id
                 WHERE e.candidate_id=c.id AND e.archived_at IS NULL AND st.category='hired') THEN 'hired'
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e JOIN pipeline_statuses su ON su.id=e.status_id JOIN pipeline_stages st ON st.id=su.stage_id
                 WHERE e.candidate_id=c.id AND e.archived_at IS NULL AND st.category='offer') THEN 'offered'
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e JOIN pipeline_statuses su ON su.id=e.status_id JOIN pipeline_stages st ON st.id=su.stage_id
                 WHERE e.candidate_id=c.id AND e.archived_at IS NULL AND st.category='active') THEN 'engaged'
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e WHERE e.candidate_id=c.id AND e.archived_at IS NOT NULL) THEN 'available'
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e JOIN pipeline_statuses su ON su.id=e.status_id JOIN pipeline_stages st ON st.id=su.stage_id
                 WHERE e.candidate_id=c.id AND e.archived_at IS NULL AND st.category='rejected') THEN 'rejected'
    WHEN EXISTS (SELECT 1 FROM candidate_emails m WHERE m.candidate_id=c.id) THEN 'in_review'
    ELSE 'new'
  END
FROM [candidates] c;

EXEC sp_set_session_context @key=N'app_is_super_admin', @value=0;
