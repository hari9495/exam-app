CREATE TABLE [dbo].[permission_profiles] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [permission_profiles_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [permissions_json] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [permission_profiles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [permission_profiles_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [permission_profiles_organization_id_name_key] ON [dbo].[permission_profiles]([organization_id], [name]);
CREATE NONCLUSTERED INDEX [permission_profiles_organization_id_idx] ON [dbo].[permission_profiles]([organization_id]);
ALTER TABLE [dbo].[users] ADD [permission_profile_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_permission_profile_id_fkey] FOREIGN KEY ([permission_profile_id]) REFERENCES [dbo].[permission_profiles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
