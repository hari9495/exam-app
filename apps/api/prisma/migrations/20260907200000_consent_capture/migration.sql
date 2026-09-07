ALTER TABLE [dbo].[candidates] ADD [consented_at] DATETIME2 NULL, [consent_version] INT NULL;
ALTER TABLE [dbo].[organizations] ADD [apply_consent_text] NVARCHAR(MAX) NULL, [apply_consent_version] INT NOT NULL CONSTRAINT [DF_organizations_apply_consent_version] DEFAULT 1;
