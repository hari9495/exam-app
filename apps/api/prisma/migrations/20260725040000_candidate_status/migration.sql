ALTER TABLE [dbo].[candidates] ADD [status] NVARCHAR(1000) NOT NULL CONSTRAINT [candidates_status_default] DEFAULT 'active';
