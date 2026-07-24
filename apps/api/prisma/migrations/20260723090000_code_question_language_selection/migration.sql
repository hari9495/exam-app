-- 1. Add the new Question columns.
ALTER TABLE [dbo].[questions] ADD [language_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [questions_language_mode_default] DEFAULT 'fixed';
ALTER TABLE [dbo].[questions] ADD [allowed_languages] NVARCHAR(MAX) NULL;
