ALTER TABLE [dbo].[organizations] ADD [ai_provider] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_ai_provider_default] DEFAULT 'anthropic';
ALTER TABLE [dbo].[organizations] ADD [ai_base_url] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[organizations] ADD [ai_model_fast] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[organizations] ADD [ai_model_standard] NVARCHAR(1000) NULL;
