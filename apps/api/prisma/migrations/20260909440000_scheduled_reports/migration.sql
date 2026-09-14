ALTER TABLE [dbo].[organizations] ADD
    [scheduled_report_enabled] BIT NOT NULL CONSTRAINT [organizations_scheduled_report_enabled_df] DEFAULT 0,
    [scheduled_report_recipients_json] NVARCHAR(MAX),
    [scheduled_report_last_sent_at] DATETIME2;
