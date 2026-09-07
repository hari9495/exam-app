CREATE TABLE [dbo].[approval_email_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [approval_email_templates_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [event_type] NVARCHAR(50) NOT NULL,
    [subject] NVARCHAR(MAX) NOT NULL,
    [body] NVARCHAR(MAX) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [approval_email_templates_enabled_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [approval_email_templates_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [approval_email_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [approval_email_templates_organization_id_event_type_key] ON [dbo].[approval_email_templates]([organization_id], [event_type]);
CREATE NONCLUSTERED INDEX [approval_email_templates_organization_id_idx] ON [dbo].[approval_email_templates]([organization_id]);
