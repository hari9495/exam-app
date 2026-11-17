-- Answer 2287: an archived test can be restored by a test writer (audited). The status it had before archiving is
-- kept so it comes back as it was (published stays published); tests archived before this have none and come back as
-- drafts. No data written.
ALTER TABLE exams ADD COLUMN archived_from VARCHAR(20) CHECK (archived_from IS NULL OR archived_from IN ('draft', 'published'));
