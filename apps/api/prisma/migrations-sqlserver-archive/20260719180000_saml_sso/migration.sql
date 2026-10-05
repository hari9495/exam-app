ALTER TABLE [dbo].[organizations] ADD [saml_enabled] BIT NOT NULL CONSTRAINT [organizations_saml_enabled_df] DEFAULT 0;
ALTER TABLE [dbo].[organizations] ADD [saml_idp_entity_id] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [saml_idp_sso_url] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [saml_idp_certificate] NVARCHAR(max);

CREATE TABLE [dbo].[sso_login_codes] (
    [id]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [sso_login_codes_id_df] DEFAULT newid(),
    [code_hash]   NVARCHAR(1000) NOT NULL,
    [user_id]     UNIQUEIDENTIFIER NOT NULL,
    [expires_at]  DATETIME2 NOT NULL,
    [created_at]  DATETIME2 NOT NULL CONSTRAINT [sso_login_codes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [sso_login_codes_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sso_login_codes_code_hash_key] UNIQUE ([code_hash]),
    CONSTRAINT [sso_login_codes_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE
);
