-- AlterTable: attempts gains a last-seen timestamp, bumped automatically on every candidate
-- request (see the LastSeenInterceptor). Never required, never blocks anything.
ALTER TABLE [dbo].[attempts] ADD [last_seen_at] DATETIME2;

-- CreateTable
CREATE TABLE [dbo].[candidate_messages] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [sent_by_user_id] UNIQUEIDENTIFIER NOT NULL,
    [body] NVARCHAR(MAX) NOT NULL,
    [sent_at] DATETIME2 NOT NULL CONSTRAINT [candidate_messages_sent_at_df] DEFAULT GETUTCDATE(),
    [read_at] DATETIME2,
    CONSTRAINT [candidate_messages_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [candidate_messages_attempt_id_sent_at_idx] ON [dbo].[candidate_messages]([attempt_id], [sent_at]);

-- AddForeignKey
ALTER TABLE [dbo].[candidate_messages] ADD CONSTRAINT [candidate_messages_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
