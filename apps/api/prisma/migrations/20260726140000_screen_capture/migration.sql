ALTER TABLE [dbo].[exams] ADD [screen_capture_enabled] BIT NOT NULL CONSTRAINT [exams_screen_capture_enabled_df] DEFAULT 0;
ALTER TABLE [dbo].[attempts] ADD [screen_share_started_at] DATETIME2;
