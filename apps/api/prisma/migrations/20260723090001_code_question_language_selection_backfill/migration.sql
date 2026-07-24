-- Split out from 20260723090000_code_question_language_selection: SQL Server compiles
-- an entire migration batch upfront, so a statement here referencing [allowed_languages]
-- can't be in the same file as the ALTER TABLE that adds it (that ALTER lives in the
-- prior migration). Splitting into a separate migration file forces a genuinely separate
-- execution, so this statement resolves against the already-committed schema.

-- 2. Backfill: every existing code question's single code_language becomes a one-item
--    allowed_languages set in Fixed mode (language_mode already defaults to 'fixed').
UPDATE [dbo].[questions]
SET [allowed_languages] = '["' + [code_language] + '"]'
WHERE [type] = 'code' AND [code_language] IS NOT NULL;

-- 3. Drop the superseded column now that its data has been migrated.
ALTER TABLE [dbo].[questions] DROP COLUMN [code_language];

-- 4. Answer gains the candidate's chosen language for their code answer.
ALTER TABLE [dbo].[answers] ADD [code_language] NVARCHAR(1000) NULL;
