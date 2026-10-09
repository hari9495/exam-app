-- Candidate unsubscribe/opt-out (Zoho #9 slice 4): a per-candidate token for one-click email
-- unsubscribe links, plus the timestamp opting the candidate out of further emails.
-- Additive, nullable (minted on outbound email / on request), unique. candidates already RLS-enabled.
ALTER TABLE [dbo].[candidates] ADD [unsubscribe_token] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[candidates] ADD [email_opted_out_at] DATETIME2 NULL;
-- EXEC-wrapped: a bare CREATE INDEX in this same batch fails to parse on SQL Server (error 207)
-- because unsubscribe_token isn't visible until the ALTER's batch completes. Deferring the index into a
-- dynamic batch lets it compile after the column exists.
EXEC('CREATE UNIQUE NONCLUSTERED INDEX [candidates_unsubscribe_token_key] ON [dbo].[candidates]([unsubscribe_token]) WHERE [unsubscribe_token] IS NOT NULL;');
