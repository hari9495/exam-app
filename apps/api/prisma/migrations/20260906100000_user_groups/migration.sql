CREATE TABLE [dbo].[user_groups] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [user_groups_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_groups_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_groups_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [user_groups_organization_id_name_key] ON [dbo].[user_groups]([organization_id], [name]);
CREATE NONCLUSTERED INDEX [user_groups_organization_id_idx] ON [dbo].[user_groups]([organization_id]);

CREATE TABLE [dbo].[user_group_members] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [user_group_members_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [group_id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_group_members_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_group_members_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [user_group_members_group_id_user_id_key] ON [dbo].[user_group_members]([group_id], [user_id]);
CREATE NONCLUSTERED INDEX [user_group_members_organization_id_user_id_idx] ON [dbo].[user_group_members]([organization_id], [user_id]);

ALTER TABLE [dbo].[pipeline_entries] ADD [assigned_group_id] UNIQUEIDENTIFIER NULL;
