ALTER TABLE [dbo].[candidates] ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[jobs] ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[pipelines] ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[walk_in_groups] ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;
