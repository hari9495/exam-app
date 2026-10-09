ALTER TABLE [dbo].[invitations] ADD [email_status] NVARCHAR(1000) NOT NULL CONSTRAINT [invitations_email_status_df] DEFAULT 'pending';
ALTER TABLE [dbo].[invitations] ADD [resend_count] INT NOT NULL CONSTRAINT [invitations_resend_count_df] DEFAULT 0;
