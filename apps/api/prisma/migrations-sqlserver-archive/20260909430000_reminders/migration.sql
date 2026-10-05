ALTER TABLE [dbo].[organizations] ADD [reminders_enabled] BIT NOT NULL CONSTRAINT [organizations_reminders_enabled_df] DEFAULT 0;
