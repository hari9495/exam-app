ALTER TABLE [dbo].[exams] ADD [feedback_visibility] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_feedback_visibility_df] DEFAULT 'pass_fail';
ALTER TABLE [dbo].[invitations] ADD [extra_time_percent] INT NOT NULL CONSTRAINT [invitations_extra_time_percent_df] DEFAULT 0;
