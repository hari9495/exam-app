-- CreateTable
CREATE TABLE [dbo].[jobs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(MAX),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [jobs_status_df] DEFAULT 'open',
    [created_by_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [jobs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [closed_at] DATETIME2,
    CONSTRAINT [jobs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[pipeline_entries] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [stage] NVARCHAR(1000) NOT NULL CONSTRAINT [pipeline_entries_stage_df] DEFAULT 'applied',
    [rejected] BIT NOT NULL CONSTRAINT [pipeline_entries_rejected_df] DEFAULT 0,
    [rejected_reason] NVARCHAR(1000),
    [rejected_at] DATETIME2,
    [entered_via] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [pipeline_entries_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [pipeline_entries_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[pipeline_feedback] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [entry_id] UNIQUEIDENTIFIER NOT NULL,
    [author_user_id] UNIQUEIDENTIFIER NOT NULL,
    [note] NVARCHAR(MAX),
    [rating] INT,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [pipeline_feedback_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [pipeline_feedback_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[job_exams] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [exam_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [job_exams_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [job_exams_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [jobs_organization_id_status_idx] ON [dbo].[jobs]([organization_id], [status]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [pipeline_entries_job_id_candidate_id_key] ON [dbo].[pipeline_entries]([job_id], [candidate_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [pipeline_entries_job_id_idx] ON [dbo].[pipeline_entries]([job_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [pipeline_feedback_entry_id_idx] ON [dbo].[pipeline_feedback]([entry_id]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [job_exams_job_id_exam_id_key] ON [dbo].[job_exams]([job_id], [exam_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [job_exams_exam_id_idx] ON [dbo].[job_exams]([exam_id]);

-- AddForeignKey
ALTER TABLE [dbo].[pipeline_entries] ADD CONSTRAINT [pipeline_entries_job_id_fkey] FOREIGN KEY ([job_id]) REFERENCES [dbo].[jobs]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[pipeline_entries] ADD CONSTRAINT [pipeline_entries_candidate_id_fkey] FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[candidates]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[pipeline_feedback] ADD CONSTRAINT [pipeline_feedback_entry_id_fkey] FOREIGN KEY ([entry_id]) REFERENCES [dbo].[pipeline_entries]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[job_exams] ADD CONSTRAINT [job_exams_job_id_fkey] FOREIGN KEY ([job_id]) REFERENCES [dbo].[jobs]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[job_exams] ADD CONSTRAINT [job_exams_exam_id_fkey] FOREIGN KEY ([exam_id]) REFERENCES [dbo].[exams]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- NOTE: the tenant RLS policy extension for these four tables lives in the
-- follow-up migration 20260818090001_ats_pipeline_rls, not here. SQL Server
-- cannot resolve ALTER SECURITY POLICY ... ON dbo.jobs in the same batch as
-- the CREATE TABLE that defines dbo.jobs (verified: `migrate deploy` failed
-- with "Cannot find the object dbo.jobs", error 33268, when both were in one
-- migration.sql). Every existing RLS-extension migration in this repo already
-- follows the same split-file pattern (e.g. 20260707150000_candidates_invitations_schema
-- + 20260707150001_candidates_rls), so this migration matches established convention.

-- Seed the pipeline:manage permission + role grants for existing production orgs
-- (seed.ts does NOT run on deploy; role/permission tables are global, not org-scoped).
DECLARE @pipelinePermId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE [key] = 'pipeline:manage')
  INSERT INTO dbo.permissions (id, [key], description)
  VALUES (@pipelinePermId, 'pipeline:manage', 'Create and manage hiring jobs and their candidate pipeline');

DECLARE @permId UNIQUEIDENTIFIER = (SELECT id FROM dbo.permissions WHERE [key] = 'pipeline:manage');
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'recruiter' AND permission_id = @permId)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('recruiter', @permId);
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'org_admin' AND permission_id = @permId)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('org_admin', @permId);
