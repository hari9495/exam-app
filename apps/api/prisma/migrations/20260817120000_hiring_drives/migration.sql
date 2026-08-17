-- CreateTable
CREATE TABLE [dbo].[drive_sessions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [walk_in_group_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [starts_at] DATETIME2 NOT NULL,
    [ends_at] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [drive_sessions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [drive_sessions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [drive_sessions_walk_in_group_id_fkey] FOREIGN KEY ([walk_in_group_id]) REFERENCES [dbo].[walk_in_groups] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [drive_sessions_walk_in_group_id_idx] ON [dbo].[drive_sessions]([walk_in_group_id]);

-- AlterTable
ALTER TABLE [dbo].[invitations] ADD [drive_session_id] UNIQUEIDENTIFIER;

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_drive_session_id_fkey] FOREIGN KEY ([drive_session_id]) REFERENCES [dbo].[drive_sessions] ([id]) ON DELETE SET NULL ON UPDATE CASCADE;
