-- CreateTable
CREATE TABLE [dbo].[candidates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [phone] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidates_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [candidates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[invitations] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [exam_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [token] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [invitations_status_df] DEFAULT 'invited',
    [invited_at] DATETIME2 NOT NULL CONSTRAINT [invitations_invited_at_df] DEFAULT GETUTCDATE(),
    [expires_at] DATETIME2 NOT NULL,
    [revoked_at] DATETIME2,
    CONSTRAINT [invitations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notifications] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [invitation_id] UNIQUEIDENTIFIER NOT NULL,
    [channel] NVARCHAR(1000) NOT NULL CONSTRAINT [notifications_channel_df] DEFAULT 'email',
    [status] NVARCHAR(1000) NOT NULL,
    [sent_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [notifications_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [candidates_organization_id_email_key] ON [dbo].[candidates]([organization_id], [email]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [invitations_token_key] ON [dbo].[invitations]([token]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invitations_exam_id_status_idx] ON [dbo].[invitations]([exam_id], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_invitation_id_idx] ON [dbo].[notifications]([invitation_id]);

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_exam_id_fkey] FOREIGN KEY ([exam_id]) REFERENCES [dbo].[exams]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_candidate_id_fkey] FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[candidates]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_invitation_id_fkey] FOREIGN KEY ([invitation_id]) REFERENCES [dbo].[invitations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: exams.status changes meaning from active/archived to draft/published/archived.
-- The default becomes 'draft'. Any pre-existing row using the old 'active' meaning is
-- migrated to 'published' so it keeps behaving the way it did before this migration --
-- an exam that was already usable is not retroactively downgraded to draft.
ALTER TABLE [dbo].[exams] DROP CONSTRAINT [exams_status_df];
ALTER TABLE [dbo].[exams] ADD CONSTRAINT [exams_status_df] DEFAULT 'draft' FOR [status];
UPDATE [dbo].[exams] SET [status] = 'published' WHERE [status] = 'active';
