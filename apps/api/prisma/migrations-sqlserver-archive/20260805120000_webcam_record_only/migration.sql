ALTER TABLE [dbo].[exams] ADD [webcam_record_only] BIT NOT NULL CONSTRAINT [exams_webcam_record_only_df] DEFAULT 0;
