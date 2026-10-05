-- The 20260707110003_uuid_columns migration had to drop and re-add each
-- table's created_at default constraint as a side effect of altering the
-- id/foreign-key columns to UNIQUEIDENTIFIER (SQL Server won't ALTER COLUMN
-- a column guarded by a DEFAULT). It re-added five of them using
-- DEFAULT CURRENT_TIMESTAMP instead of the original DEFAULT GETUTCDATE()
-- used in 20260707104325_init_schema, reintroducing a UTC-vs-local-time
-- inconsistency (CURRENT_TIMESTAMP is OS-local time, not UTC) across
-- audit_logs, organizations, plans, refresh_tokens, and users. This mirrors
-- the same bug already fixed for questions.created_at in
-- 20260707130001_fix_questions_created_at_default.

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_created_at_df];
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_created_at_df] DEFAULT GETUTCDATE() FOR [created_at];

ALTER TABLE [dbo].[organizations] DROP CONSTRAINT [organizations_created_at_df];
ALTER TABLE [dbo].[organizations] ADD CONSTRAINT [organizations_created_at_df] DEFAULT GETUTCDATE() FOR [created_at];

ALTER TABLE [dbo].[plans] DROP CONSTRAINT [plans_created_at_df];
ALTER TABLE [dbo].[plans] ADD CONSTRAINT [plans_created_at_df] DEFAULT GETUTCDATE() FOR [created_at];

ALTER TABLE [dbo].[refresh_tokens] DROP CONSTRAINT [refresh_tokens_created_at_df];
ALTER TABLE [dbo].[refresh_tokens] ADD CONSTRAINT [refresh_tokens_created_at_df] DEFAULT GETUTCDATE() FOR [created_at];

ALTER TABLE [dbo].[users] DROP CONSTRAINT [users_created_at_df];
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_created_at_df] DEFAULT GETUTCDATE() FOR [created_at];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
