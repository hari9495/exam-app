-- Candidate portal (#4): a per-candidate magic-link token for the unified self-service portal.
-- Additive, nullable (minted on apply / on request), unique.
ALTER TABLE [dbo].[candidates] ADD [portal_token] NVARCHAR(1000) NULL;
-- EXEC-wrapped: a bare CREATE INDEX in this same batch fails to parse on SQL Server (error 207)
-- because portal_token isn't visible until the ALTER's batch completes. Deferring the index into a
-- dynamic batch lets it compile after the column exists.
EXEC('CREATE UNIQUE NONCLUSTERED INDEX [candidates_portal_token_key] ON [dbo].[candidates]([portal_token]) WHERE [portal_token] IS NOT NULL;');
