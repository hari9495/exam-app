-- Agency portal: agencies, per-agency job assignment, and candidate
-- submissions from agencies. RLS predicates for the three org-scoped
-- tables are added in the follow-up migration 20260908250001_agency_portal_rls,
-- not here: SQL Server cannot resolve ALTER SECURITY POLICY ... ON dbo.<table>
-- in the same batch/transaction as the CREATE TABLE that defines it (see
-- 20260903120000_requisitions_and_approvals + ..._rls for the same split).
-- CreateTable
CREATE TABLE [dbo].[agencies] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [contact_email] NVARCHAR(1000),
    [portal_token] NVARCHAR(1000) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [agencies_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [agencies_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [agencies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [agencies_portal_token_key] UNIQUE NONCLUSTERED ([portal_token]),
    CONSTRAINT [agencies_organization_id_name_key] UNIQUE NONCLUSTERED ([organization_id],[name])
);

-- CreateTable
CREATE TABLE [dbo].[agency_jobs] (
    [agency_id] UNIQUEIDENTIFIER NOT NULL,
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [agency_jobs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [agency_jobs_pkey] PRIMARY KEY CLUSTERED ([agency_id],[job_id])
);

-- CreateTable
CREATE TABLE [dbo].[agency_submissions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [agency_id] UNIQUEIDENTIFIER NOT NULL,
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_name] NVARCHAR(1000) NOT NULL,
    [candidate_email] NVARCHAR(1000) NOT NULL,
    [candidate_phone] NVARCHAR(1000),
    [resume_path] NVARCHAR(1000) NOT NULL,
    [is_duplicate] BIT NOT NULL CONSTRAINT [agency_submissions_is_duplicate_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [agency_submissions_status_df] DEFAULT 'pending',
    [candidate_id] UNIQUEIDENTIFIER,
    [reviewed_by_user_id] UNIQUEIDENTIFIER,
    [reviewed_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [agency_submissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [agency_submissions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [agencies_organization_id_idx] ON [dbo].[agencies]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [agency_jobs_job_id_idx] ON [dbo].[agency_jobs]([job_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [agency_jobs_organization_id_idx] ON [dbo].[agency_jobs]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [agency_submissions_organization_id_status_idx] ON [dbo].[agency_submissions]([organization_id], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [agency_submissions_agency_id_idx] ON [dbo].[agency_submissions]([agency_id]);

-- AddForeignKey
ALTER TABLE [dbo].[agency_jobs] ADD CONSTRAINT [agency_jobs_agency_id_fkey] FOREIGN KEY ([agency_id]) REFERENCES [dbo].[agencies]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[agency_jobs] ADD CONSTRAINT [agency_jobs_job_id_fkey] FOREIGN KEY ([job_id]) REFERENCES [dbo].[jobs]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[agency_submissions] ADD CONSTRAINT [agency_submissions_agency_id_fkey] FOREIGN KEY ([agency_id]) REFERENCES [dbo].[agencies]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[agency_submissions] ADD CONSTRAINT [agency_submissions_job_id_fkey] FOREIGN KEY ([job_id]) REFERENCES [dbo].[jobs]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
