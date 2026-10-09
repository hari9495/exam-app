ALTER TABLE [dbo].[questions] ADD [allow_stdin] BIT NOT NULL CONSTRAINT [questions_allow_stdin_default] DEFAULT 0;
