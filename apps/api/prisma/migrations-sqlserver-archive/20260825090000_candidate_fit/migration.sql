-- AlterTable: additive nullable job criteria (no same-batch reference -> no EXEC-wrap needed)
ALTER TABLE [dbo].[jobs] ADD [fit_criteria] NVARCHAR(MAX), [fit_rubric] NVARCHAR(MAX);

-- CreateTable
CREATE TABLE [dbo].[candidate_fit_assessments] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [entry_id] UNIQUEIDENTIFIER NOT NULL,
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [candidate_fit_assessments_status_df] DEFAULT 'pending',
    [overall_score] INT,
    [summary] NVARCHAR(MAX),
    [strengths] NVARCHAR(MAX),
    [concerns] NVARCHAR(MAX),
    [dimension_scores] NVARCHAR(MAX),
    [criteria_hash] NVARCHAR(1000),
    [model_used] NVARCHAR(1000),
    [scored_by_user_id] UNIQUEIDENTIFIER,
    [scored_at] DATETIME2,
    [ai_job_id] UNIQUEIDENTIFIER,
    [error] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_fit_assessments_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [candidate_fit_assessments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [candidate_fit_assessments_entry_id_key] UNIQUE NONCLUSTERED ([entry_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [candidate_fit_assessments_organization_id_job_id_idx] ON [dbo].[candidate_fit_assessments]([organization_id], [job_id]);

-- AddForeignKey (only FK: to pipeline_entries, single cascade path)
ALTER TABLE [dbo].[candidate_fit_assessments] ADD CONSTRAINT [candidate_fit_assessments_entry_id_fkey] FOREIGN KEY ([entry_id]) REFERENCES [dbo].[pipeline_entries]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
