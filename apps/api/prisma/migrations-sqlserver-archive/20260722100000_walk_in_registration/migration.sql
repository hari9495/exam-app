ALTER TABLE [dbo].[exams] ADD [walk_in_enabled] BIT NOT NULL CONSTRAINT [exams_walk_in_enabled_df] DEFAULT 0;
ALTER TABLE [dbo].[invitations] ADD [source] NVARCHAR(1000) NOT NULL CONSTRAINT [invitations_source_df] DEFAULT 'invited';
