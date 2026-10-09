ALTER TABLE [dbo].[exams] ADD [lockdown_required] BIT NOT NULL CONSTRAINT [exams_lockdown_required_df] DEFAULT 0;
