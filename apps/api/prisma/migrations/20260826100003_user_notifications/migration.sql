-- Team-collaboration in-app notifications (Phase 1: @mentions in candidate feedback).
CREATE TABLE [dbo].[user_notifications] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [user_notifications_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [recipient_user_id] UNIQUEIDENTIFIER NOT NULL,
    [actor_user_id] UNIQUEIDENTIFIER,
    [type] NVARCHAR(1000) NOT NULL,
    [entity_type] NVARCHAR(1000) NOT NULL,
    [entity_id] UNIQUEIDENTIFIER NOT NULL,
    [context_text] NVARCHAR(500),
    [link_path] NVARCHAR(1000) NOT NULL,
    [read_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [user_notifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_notifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [user_notifications_recipient_user_id_read_at_idx] ON [dbo].[user_notifications]([recipient_user_id], [read_at]);
