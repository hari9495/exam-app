-- AlterTable: organizations gains optional per-org email/SMTP and AI API key configuration.
-- All nullable with no default -- an org with nothing set falls back to the platform's
-- shared SMTP account / ANTHROPIC_API_KEY exactly as before this migration.
ALTER TABLE [dbo].[organizations] ADD [smtp_host] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [smtp_port] INT;
ALTER TABLE [dbo].[organizations] ADD [smtp_user] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [smtp_password_encrypted] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [email_from_address] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [ai_api_key_encrypted] NVARCHAR(1000);
