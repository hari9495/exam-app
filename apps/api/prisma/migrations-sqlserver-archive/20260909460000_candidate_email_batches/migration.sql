CREATE TABLE [dbo].[candidate_email_batches] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [candidate_email_batches_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [created_by_user_id] UNIQUEIDENTIFIER,
    [subject] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [candidate_email_batches_status_df] DEFAULT 'pending',
    [total] INT NOT NULL CONSTRAINT [candidate_email_batches_total_df] DEFAULT 0,
    [sent] INT NOT NULL CONSTRAINT [candidate_email_batches_sent_df] DEFAULT 0,
    [skipped] INT NOT NULL CONSTRAINT [candidate_email_batches_skipped_df] DEFAULT 0,
    [failed] INT NOT NULL CONSTRAINT [candidate_email_batches_failed_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_email_batches_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [candidate_email_batches_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE INDEX [candidate_email_batches_org_created_idx] ON [dbo].[candidate_email_batches]([organization_id], [created_at]);
