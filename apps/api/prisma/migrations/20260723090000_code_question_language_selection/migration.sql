-- 1. Add the new Question columns.
ALTER TABLE [dbo].[questions] ADD [language_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [questions_language_mode_default] DEFAULT 'fixed';
ALTER TABLE [dbo].[questions] ADD [allowed_languages] NVARCHAR(MAX) NULL;

-- 2. Backfill: every existing code question's single code_language becomes a one-item
--    allowed_languages set in Fixed mode (language_mode already defaults to 'fixed').
UPDATE [dbo].[questions]
SET [allowed_languages] = '["' + [code_language] + '"]'
WHERE [type] = 'code' AND [code_language] IS NOT NULL;

-- 3. Drop the superseded column now that its data has been migrated.
ALTER TABLE [dbo].[questions] DROP COLUMN [code_language];

-- 4. Answer gains the candidate's chosen language for their code answer.
ALTER TABLE [dbo].[answers] ADD [code_language] NVARCHAR(1000) NULL;
