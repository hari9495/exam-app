ALTER TABLE [dbo].[exams] ADD [scheduling_enabled] BIT NOT NULL CONSTRAINT [exams_scheduling_enabled_default] DEFAULT 0,
[availability_window_start] DATETIME2,
[availability_window_end] DATETIME2;
