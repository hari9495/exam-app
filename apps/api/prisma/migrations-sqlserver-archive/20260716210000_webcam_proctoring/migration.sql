ALTER TABLE [dbo].[attempts] ADD [webcam_violation_count] INT NOT NULL CONSTRAINT [attempts_webcam_violation_count_default] DEFAULT 0;
ALTER TABLE [dbo].[attempts] ADD [paused_at] DATETIME2;
ALTER TABLE [dbo].[attempts] ADD [paused_duration_ms] INT NOT NULL CONSTRAINT [attempts_paused_duration_ms_default] DEFAULT 0;
