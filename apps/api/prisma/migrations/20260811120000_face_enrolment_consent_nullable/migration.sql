-- A candidate who declines the photo check still gets a face_enrolments row, so their refusal is
-- recorded rather than being indistinguishable from an exam with the feature switched off. That
-- row carries no image and no consent moment, so consent_at must be nullable.
ALTER TABLE [dbo].[face_enrolments] ALTER COLUMN [consent_at] DATETIME2 NULL;
