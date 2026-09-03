-- Candidate portal (#4): a per-candidate magic-link token for the unified self-service portal.
-- Additive, nullable (minted on apply / on request), unique.
ALTER TABLE [dbo].[candidates] ADD [portal_token] NVARCHAR(1000) NULL;
CREATE UNIQUE NONCLUSTERED INDEX [candidates_portal_token_key] ON [dbo].[candidates]([portal_token]) WHERE [portal_token] IS NOT NULL;
