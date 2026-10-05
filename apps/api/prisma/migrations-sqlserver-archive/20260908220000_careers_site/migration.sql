ALTER TABLE [dbo].[jobs] ADD [list_on_careers] BIT NOT NULL CONSTRAINT [DF_jobs_list_on_careers] DEFAULT 0;
ALTER TABLE [dbo].[organizations] ADD [careers_enabled] BIT NOT NULL CONSTRAINT [DF_organizations_careers_enabled] DEFAULT 0, [careers_headline] NVARCHAR(1000) NULL, [careers_intro] NVARCHAR(MAX) NULL, [careers_banner_path] NVARCHAR(1000) NULL;
