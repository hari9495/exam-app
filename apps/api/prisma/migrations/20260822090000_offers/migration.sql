-- CreateTable
CREATE TABLE [dbo].[offers] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [pipeline_entry_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [compensation] NVARCHAR(MAX) NOT NULL,
    [start_date] DATETIME2 NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [offers_status_df] DEFAULT 'draft',
    [offer_token] NVARCHAR(1000),
    [pdf_path] NVARCHAR(1000),
    [letter_subject] NVARCHAR(MAX) NOT NULL,
    [letter_body] NVARCHAR(MAX) NOT NULL,
    [sent_by_user_id] UNIQUEIDENTIFIER,
    [sent_at] DATETIME2,
    [responded_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [offers_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [offers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [offers_offer_token_key] UNIQUE NONCLUSTERED ([offer_token])
);

-- CreateTable
CREATE TABLE [dbo].[offer_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [subject] NVARCHAR(MAX) NOT NULL,
    [body] NVARCHAR(MAX) NOT NULL,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [offer_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [offers_organization_id_pipeline_entry_id_idx] ON [dbo].[offers]([organization_id], [pipeline_entry_id]);
CREATE NONCLUSTERED INDEX [offers_organization_id_candidate_id_idx] ON [dbo].[offers]([organization_id], [candidate_id]);
CREATE NONCLUSTERED INDEX [offer_templates_organization_id_idx] ON [dbo].[offer_templates]([organization_id]);

-- AddForeignKey
ALTER TABLE [dbo].[offers] ADD CONSTRAINT [offers_pipeline_entry_id_fkey] FOREIGN KEY ([pipeline_entry_id]) REFERENCES [dbo].[pipeline_entries]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
