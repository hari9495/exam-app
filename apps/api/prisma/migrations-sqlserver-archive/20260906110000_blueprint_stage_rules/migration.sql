ALTER TABLE [dbo].[pipeline_stages] ADD [rules_json] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[pipeline_entries] ADD [blueprint_checklist_json] NVARCHAR(MAX) NULL;
