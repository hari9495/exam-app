-- Behavior-preserving data migration: seed a default pipeline per org and map
-- existing pipeline_entries/jobs onto the new statusId/pipelineId columns.
-- Idempotent: every INSERT/UPDATE is guarded so re-running this script is a no-op
-- once an org/entry has already been migrated.

-- (a) one default pipeline per org lacking one
INSERT INTO [pipelines] (id, organization_id, name, is_default, updated_at)
SELECT NEWID(), o.id, 'Default Pipeline', 1, CURRENT_TIMESTAMP
FROM [organizations] o
WHERE NOT EXISTS (SELECT 1 FROM [pipelines] p WHERE p.organization_id = o.id);

-- (b) stages for each brand-new default pipeline (6 rows via a VALUES join)
INSERT INTO [pipeline_stages] (id, organization_id, pipeline_id, name, category, position)
SELECT NEWID(), p.organization_id, p.id, s.name, s.category, s.position
FROM [pipelines] p
CROSS JOIN (VALUES
  ('applied','active',0),('screened','active',1),('interview','active',2),
  ('offer','offer',3),('hired','hired',4),('rejected','rejected',5)
) AS s(name, category, position)
WHERE p.is_default = 1
  AND NOT EXISTS (SELECT 1 FROM [pipeline_stages] st WHERE st.pipeline_id = p.id);

-- (c) one status per stage, same name
INSERT INTO [pipeline_statuses] (id, organization_id, stage_id, name, position)
SELECT NEWID(), st.organization_id, st.id, st.name, 0
FROM [pipeline_stages] st
WHERE NOT EXISTS (SELECT 1 FROM [pipeline_statuses] su WHERE su.stage_id = st.id);

-- (d) jobs.pipeline_id -> org default
UPDATE j SET j.pipeline_id = p.id
FROM [jobs] j
JOIN [pipelines] p ON p.organization_id = j.organization_id AND p.is_default = 1
WHERE j.pipeline_id IS NULL;

-- (e) entry.status_id from legacy stage/rejected
UPDATE e SET e.status_id = su.id
FROM [pipeline_entries] e
JOIN [pipelines] p ON p.organization_id = e.organization_id AND p.is_default = 1
JOIN [pipeline_stages] st ON st.pipeline_id = p.id
  AND st.name = CASE WHEN e.rejected = 1 THEN 'rejected'
                     WHEN e.stage IN ('applied','screened','interview','offer','hired') THEN e.stage
                     ELSE 'applied' END
JOIN [pipeline_statuses] su ON su.stage_id = st.id
WHERE e.status_id IS NULL;

-- NOTE: the legacy [pipeline_entries].[stage] column is intentionally KEPT here.
-- Dropping it is deferred to a later task, after API call sites that still read
-- PipelineEntry.stage are migrated off it, so every commit keeps compiling.
