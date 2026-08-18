-- CreateTable
CREATE TABLE [dbo].[candidate_email_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [trigger_event] NVARCHAR(1000),
    [trigger_mode] NVARCHAR(1000) NOT NULL,
    [subject] NVARCHAR(MAX) NOT NULL,
    [body] NVARCHAR(MAX) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [candidate_email_templates_enabled_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_email_templates_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [candidate_email_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[candidate_emails] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [pipeline_entry_id] UNIQUEIDENTIFIER,
    [template_id] UNIQUEIDENTIFIER,
    [to_email] NVARCHAR(1000) NOT NULL,
    [subject] NVARCHAR(MAX) NOT NULL,
    [rendered_body] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL,
    [sent_by_user_id] UNIQUEIDENTIFIER,
    [error_detail] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_emails_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [candidate_emails_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [candidate_email_templates_organization_id_idx] ON [dbo].[candidate_email_templates]([organization_id]);
CREATE NONCLUSTERED INDEX [candidate_emails_organization_id_candidate_id_idx] ON [dbo].[candidate_emails]([organization_id], [candidate_id]);
CREATE NONCLUSTERED INDEX [candidate_emails_pipeline_entry_id_idx] ON [dbo].[candidate_emails]([pipeline_entry_id]);

-- AddForeignKey
ALTER TABLE [dbo].[candidate_emails] ADD CONSTRAINT [candidate_emails_candidate_id_fkey] FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[candidates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[candidate_emails] ADD CONSTRAINT [candidate_emails_pipeline_entry_id_fkey] FOREIGN KEY ([pipeline_entry_id]) REFERENCES [dbo].[pipeline_entries]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE [dbo].[candidate_emails] ADD CONSTRAINT [candidate_emails_template_id_fkey] FOREIGN KEY ([template_id]) REFERENCES [dbo].[candidate_email_templates]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
