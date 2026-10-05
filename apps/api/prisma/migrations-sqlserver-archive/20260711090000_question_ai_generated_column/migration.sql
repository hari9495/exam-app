-- AlterTable
ALTER TABLE [dbo].[questions] ADD [ai_generated] BIT NOT NULL CONSTRAINT [questions_ai_generated_df] DEFAULT 0;
