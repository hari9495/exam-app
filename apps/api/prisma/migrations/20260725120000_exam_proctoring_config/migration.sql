ALTER TABLE [dbo].[exams] ADD [webcam_proctoring_enabled] BIT NOT NULL CONSTRAINT [exams_webcam_proctoring_enabled_df] DEFAULT 1;
ALTER TABLE [dbo].[exams] ADD [proctoring_enforcement] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_proctoring_enforcement_df] DEFAULT 'block';
ALTER TABLE [dbo].[exams] ADD [proctoring_strike_limit] INT NOT NULL CONSTRAINT [exams_proctoring_strike_limit_df] DEFAULT 3;
ALTER TABLE [dbo].[exams] ADD [disabled_proctoring_signals_json] NVARCHAR(MAX);
