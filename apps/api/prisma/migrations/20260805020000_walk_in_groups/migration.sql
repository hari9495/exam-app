-- CreateTable
CREATE TABLE [dbo].[walk_in_groups] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [walk_in_groups_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [walk_in_groups_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [walk_in_groups_organization_id_name_key] UNIQUE NONCLUSTERED ([organization_id],[name])
);

-- AlterTable
ALTER TABLE [dbo].[exams] ADD [walk_in_group_id] UNIQUEIDENTIFIER;

-- AddForeignKey
ALTER TABLE [dbo].[exams] ADD CONSTRAINT [exams_walk_in_group_id_fkey] FOREIGN KEY ([walk_in_group_id]) REFERENCES [dbo].[walk_in_groups]([id]) ON DELETE SET NULL ON UPDATE CASCADE;
