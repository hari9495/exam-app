-- Adds the stored candidate global-stage rollup (mirrors deriveGlobalStage's precedence over
-- a candidate's pipeline entries) and the org-level toggle for auto-archiving sibling entries
-- when one is hired. Pure DDL -- no cross-tenant DML, no RLS bypass needed.
ALTER TABLE [candidates] ADD [global_stage] NVARCHAR(1000) NOT NULL CONSTRAINT [candidates_global_stage_df] DEFAULT 'new';
CREATE INDEX [candidates_organization_id_global_stage_idx] ON [candidates]([organization_id], [global_stage]);
ALTER TABLE [organizations] ADD [auto_archive_siblings_on_hire] BIT NOT NULL CONSTRAINT [organizations_auto_archive_df] DEFAULT 1;
