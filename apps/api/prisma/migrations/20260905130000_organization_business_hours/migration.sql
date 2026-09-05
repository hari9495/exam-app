-- Business hours + holidays (task 2): additive nullable JSON columns on organizations.
-- No backfill, no default, no RLS change.
ALTER TABLE [dbo].[organizations] ADD [business_hours_json] NVARCHAR(max);
ALTER TABLE [dbo].[organizations] ADD [holidays_json] NVARCHAR(max);
