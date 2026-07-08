-- AlterTable: organizations gains optional white-label branding fields. All three are
-- nullable with no default -- an org with nothing set keeps the current unstyled look.
ALTER TABLE [dbo].[organizations] ADD [logo_path] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [primary_color] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [accent_color] NVARCHAR(1000);
