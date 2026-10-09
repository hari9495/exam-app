ALTER TABLE [dbo].[attempts] ADD [browser_activity_violation_count] INT NOT NULL CONSTRAINT [attempts_browser_activity_violation_count_default] DEFAULT 0;
