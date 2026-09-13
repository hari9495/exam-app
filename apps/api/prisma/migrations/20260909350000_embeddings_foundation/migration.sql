ALTER TABLE [dbo].[organizations] ADD [embedding_api_key_encrypted] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[organizations] ADD [embedding_base_url] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[organizations] ADD [embedding_model] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[candidate_profiles] ADD [embedding_json] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[candidate_profiles] ADD [embedding_model] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[candidate_profiles] ADD [embedding_hash] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[candidate_profiles] ADD [embedded_at] DATETIME2 NULL;
