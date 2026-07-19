ALTER TABLE [dbo].[organizations] ADD [api_key_hash] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [api_key_prefix] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [api_key_created_at] DATETIME2;
ALTER TABLE [dbo].[organizations] ADD [webhook_url] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [webhook_secret_encrypted] NVARCHAR(1000);

CREATE TABLE [dbo].[webhook_deliveries] (
    [id]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT [webhook_deliveries_id_df] DEFAULT newid(),
    [organization_id]  UNIQUEIDENTIFIER NOT NULL,
    [event_type]       NVARCHAR(1000) NOT NULL,
    [payload_json]     NVARCHAR(max) NOT NULL,
    [status]           NVARCHAR(1000) NOT NULL CONSTRAINT [webhook_deliveries_status_df] DEFAULT 'pending',
    [http_status_code] INT,
    [attempt_count]    INT NOT NULL CONSTRAINT [webhook_deliveries_attempt_count_df] DEFAULT 0,
    [last_attempt_at]  DATETIME2,
    [created_at]       DATETIME2 NOT NULL CONSTRAINT [webhook_deliveries_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [webhook_deliveries_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [webhook_deliveries_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX [webhook_deliveries_organization_id_created_at_idx] ON [dbo].[webhook_deliveries]([organization_id], [created_at]);
