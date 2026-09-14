ALTER TABLE [dbo].[exams] ADD
    [certificates_enabled] BIT NOT NULL CONSTRAINT [exams_certificates_enabled_df] DEFAULT 0;

ALTER TABLE [dbo].[results] ADD
    [certificate_path] NVARCHAR(1000);

CREATE TABLE [dbo].[certificate_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [certificate_templates_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(300) NOT NULL,
    [body_text] NVARCHAR(MAX) NOT NULL,
    [signatory_name] NVARCHAR(200),
    [enabled] BIT NOT NULL CONSTRAINT [certificate_templates_enabled_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [certificate_templates_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [certificate_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE INDEX [certificate_templates_org_uq] ON [dbo].[certificate_templates]([organization_id]);
