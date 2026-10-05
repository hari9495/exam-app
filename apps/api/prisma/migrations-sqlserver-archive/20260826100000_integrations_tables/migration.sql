CREATE TABLE [dbo].[org_integrations] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [org_integrations_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [label] NVARCHAR(1000) NOT NULL,
    [target_url_encrypted] NVARCHAR(MAX) NOT NULL,
    [events] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [org_integrations_status_df] DEFAULT 'active',
    [last_delivery_at] DATETIME2,
    [last_error] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [org_integrations_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [org_integrations_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[integration_deliveries] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [integration_deliveries_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [integration_id] UNIQUEIDENTIFIER NOT NULL,
    [event_type] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [integration_deliveries_status_df] DEFAULT 'pending',
    [http_status_code] INT,
    [attempt_count] INT NOT NULL CONSTRAINT [integration_deliveries_attempt_count_df] DEFAULT 0,
    [error_detail] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [integration_deliveries_created_at_df] DEFAULT GETUTCDATE(),
    [last_attempt_at] DATETIME2,
    CONSTRAINT [integration_deliveries_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE INDEX [integration_deliveries_integration_id_idx] ON [dbo].[integration_deliveries]([integration_id]);
