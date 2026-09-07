ALTER TABLE [dbo].[organizations]
  ADD [record_visibility_enabled] BIT NOT NULL
  CONSTRAINT [DF_organizations_record_visibility_enabled] DEFAULT 0;
