CREATE TABLE [dbo].[user_notification_preferences] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [user_notification_preferences_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [user_id] UNIQUEIDENTIFIER NOT NULL,
  [type] NVARCHAR(1000) NOT NULL,
  [email_enabled] BIT NOT NULL,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [user_notification_preferences_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  [updated_at] DATETIME2 NOT NULL
);
CREATE UNIQUE INDEX [user_notification_preferences_user_id_type_key] ON [dbo].[user_notification_preferences]([user_id], [type]);
CREATE INDEX [user_notification_preferences_organization_id_idx] ON [dbo].[user_notification_preferences]([organization_id]);
