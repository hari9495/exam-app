ALTER TABLE [dbo].[organizations] ADD
    [hris_export_enabled] BIT NOT NULL CONSTRAINT [organizations_hris_export_enabled_df] DEFAULT 0,
    [hris_provider] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_hris_provider_df] DEFAULT 'generic',
    [hris_target_url] NVARCHAR(1000),
    [hris_auth_header_encrypted] NVARCHAR(MAX);

CREATE TABLE [dbo].[hris_export_deliveries] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [hris_export_deliveries_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [payload_json] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [hris_export_deliveries_status_df] DEFAULT 'pending',
    [http_status_code] INT,
    [attempt_count] INT NOT NULL CONSTRAINT [hris_export_deliveries_attempt_count_df] DEFAULT 0,
    [error_detail] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [hris_export_deliveries_created_at_df] DEFAULT GETUTCDATE(),
    [last_attempt_at] DATETIME2,
    CONSTRAINT [hris_export_deliveries_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE INDEX [hris_export_deliveries_org_created_idx] ON [dbo].[hris_export_deliveries]([organization_id], [created_at]);
