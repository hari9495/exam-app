CREATE TABLE [dbo].[api_usage_daily] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [api_usage_daily_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [day] DATE NOT NULL,
    [endpoint] NVARCHAR(1000) NOT NULL,
    [request_count] INT NOT NULL CONSTRAINT [api_usage_daily_request_count_df] DEFAULT 0,
    [throttled_count] INT NOT NULL CONSTRAINT [api_usage_daily_throttled_count_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [api_usage_daily_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [api_usage_daily_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [api_usage_daily_organization_id_day_endpoint_key] ON [dbo].[api_usage_daily]([organization_id], [day], [endpoint]);
CREATE NONCLUSTERED INDEX [api_usage_daily_organization_id_day_idx] ON [dbo].[api_usage_daily]([organization_id], [day]);
