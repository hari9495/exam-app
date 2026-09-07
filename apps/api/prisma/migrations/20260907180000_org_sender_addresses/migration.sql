CREATE TABLE [dbo].[org_sender_addresses] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [org_sender_addresses_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [label] NVARCHAR(200) NOT NULL,
    [address] NVARCHAR(320) NOT NULL,
    [is_default] BIT NOT NULL CONSTRAINT [org_sender_addresses_is_default_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [org_sender_addresses_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [org_sender_addresses_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [org_sender_addresses_organization_id_address_key] ON [dbo].[org_sender_addresses]([organization_id], [address]);
CREATE NONCLUSTERED INDEX [org_sender_addresses_organization_id_idx] ON [dbo].[org_sender_addresses]([organization_id]);
