ALTER TABLE [dbo].[exams] ADD [webcam_ai_analysis_enabled] BIT NOT NULL CONSTRAINT [DF_exams_webcam_ai_analysis_enabled] DEFAULT 0;
