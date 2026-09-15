CREATE TABLE [dbo].[survey_definitions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [survey_definitions_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [survey_definitions_enabled_df] DEFAULT 0,
    [trigger_stage] NVARCHAR(1000),
    [questions_json] NVARCHAR(MAX) NOT NULL CONSTRAINT [survey_definitions_questions_json_df] DEFAULT '[]',
    [created_by_user_id] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [survey_definitions_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [survey_definitions_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE INDEX [survey_definitions_org_idx] ON [dbo].[survey_definitions]([organization_id]);
