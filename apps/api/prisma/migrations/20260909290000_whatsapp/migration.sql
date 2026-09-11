ALTER TABLE [dbo].[organizations]
  ADD [whatsapp_enabled] BIT NOT NULL CONSTRAINT [DF_organizations_whatsapp_enabled] DEFAULT 0,
      [whatsapp_provider] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_organizations_whatsapp_provider] DEFAULT 'twilio',
      [whatsapp_config_encrypted] NVARCHAR(MAX) NULL;

ALTER TABLE [dbo].[candidates] ADD [whatsapp_opted_out_at] DATETIME2 NULL;

-- CreateTable
CREATE TABLE [dbo].[candidate_whatsapp_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [trigger_stage_id] UNIQUEIDENTIFIER,
    [trigger_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [candidate_whatsapp_templates_trigger_mode_df] DEFAULT 'manual',
    [body] NVARCHAR(MAX) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [candidate_whatsapp_templates_enabled_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_whatsapp_templates_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [candidate_whatsapp_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[candidate_whatsapp] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [pipeline_entry_id] UNIQUEIDENTIFIER,
    [template_id] UNIQUEIDENTIFIER,
    [to_phone] NVARCHAR(1000) NOT NULL,
    [rendered_body] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL,
    [sent_by_user_id] UNIQUEIDENTIFIER,
    [error_detail] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_whatsapp_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [candidate_whatsapp_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [candidate_whatsapp_templates_organization_id_idx] ON [dbo].[candidate_whatsapp_templates]([organization_id]);
CREATE NONCLUSTERED INDEX [candidate_whatsapp_organization_id_candidate_id_idx] ON [dbo].[candidate_whatsapp]([organization_id], [candidate_id]);
CREATE NONCLUSTERED INDEX [candidate_whatsapp_pipeline_entry_id_idx] ON [dbo].[candidate_whatsapp]([pipeline_entry_id]);

-- AddForeignKey
ALTER TABLE [dbo].[candidate_whatsapp] ADD CONSTRAINT [candidate_whatsapp_candidate_id_fkey] FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[candidates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
