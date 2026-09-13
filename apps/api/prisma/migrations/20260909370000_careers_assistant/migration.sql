ALTER TABLE [dbo].[organizations] ADD [careers_assistant_enabled] BIT NOT NULL CONSTRAINT [organizations_careers_assistant_enabled_df] DEFAULT 0;
