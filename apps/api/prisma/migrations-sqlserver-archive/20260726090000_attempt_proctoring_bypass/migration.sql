ALTER TABLE [dbo].[attempts] ADD [proctoring_bypassed_at] DATETIME2;
ALTER TABLE [dbo].[attempts] ADD [proctoring_bypassed_by] UNIQUEIDENTIFIER;
ALTER TABLE [dbo].[attempts] ADD [proctoring_bypass_reason] NVARCHAR(1000);
