ALTER TABLE [dbo].[attempts] ADD [face_mismatch_count] INT NOT NULL CONSTRAINT [attempts_face_mismatch_count_df] DEFAULT 0;
ALTER TABLE [dbo].[exams] ADD [face_mismatch_action] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_face_mismatch_action_df] DEFAULT 'flag';
