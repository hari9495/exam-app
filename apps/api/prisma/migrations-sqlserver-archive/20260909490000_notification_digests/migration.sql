ALTER TABLE [dbo].[users] ADD
    [notification_digest] NVARCHAR(1000) NOT NULL CONSTRAINT [users_notification_digest_df] DEFAULT 'immediate',
    [last_digest_sent_at] DATETIME2;
