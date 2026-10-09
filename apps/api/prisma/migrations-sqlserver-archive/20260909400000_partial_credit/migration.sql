ALTER TABLE [dbo].[questions] ADD [partial_credit] BIT NOT NULL CONSTRAINT [DF_questions_partial_credit] DEFAULT 0;
