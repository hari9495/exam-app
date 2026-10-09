CREATE TABLE [dbo].[drip_campaigns] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [drip_campaigns_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [drip_campaigns_enabled_df] DEFAULT 0,
    [target_global_stage] NVARCHAR(1000),
    [steps_json] NVARCHAR(MAX) NOT NULL CONSTRAINT [drip_campaigns_steps_json_df] DEFAULT '[]',
    [created_by_user_id] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [drip_campaigns_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [drip_campaigns_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE INDEX [drip_campaigns_org_idx] ON [dbo].[drip_campaigns]([organization_id]);
