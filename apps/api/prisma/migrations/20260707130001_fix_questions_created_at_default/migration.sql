-- Corrective migration: the questions_created_at_df default constraint was
-- created with CURRENT_TIMESTAMP (equivalent to GETDATE()), which returns
-- the SQL Server host OS's local time, not UTC. Every other created_at
-- default in this schema (plans, organizations, users, refresh_tokens,
-- audit_logs) uses GETUTCDATE(). Realign questions.created_at with that
-- convention so cross-table timestamp comparisons stay on a single UTC
-- time reference regardless of the DB host's OS clock/timezone.

ALTER TABLE [dbo].[questions] DROP CONSTRAINT [questions_created_at_df];

ALTER TABLE [dbo].[questions] ADD CONSTRAINT [questions_created_at_df] DEFAULT GETUTCDATE() FOR [created_at];
