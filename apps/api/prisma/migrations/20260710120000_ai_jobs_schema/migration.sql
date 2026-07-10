-- CreateTable
CREATE TABLE [dbo].[ai_jobs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ai_jobs_status_df] DEFAULT 'pending',
    [input_json] NVARCHAR(MAX) NOT NULL,
    [output_json] NVARCHAR(MAX),
    [error] NVARCHAR(MAX),
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [ai_jobs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [ai_jobs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ai_jobs_organization_id_status_idx] ON [dbo].[ai_jobs]([organization_id], [status]);
