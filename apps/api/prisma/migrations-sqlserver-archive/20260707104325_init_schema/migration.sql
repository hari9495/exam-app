-- CreateTable
CREATE TABLE [dbo].[plans] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [candidate_limit] INT NOT NULL,
    [ai_credit_limit] INT NOT NULL,
    [proctoring_minutes_limit] INT NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [plans_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [plans_pkey] PRIMARY KEY ([id])
);

-- CreateTable
CREATE TABLE [dbo].[organizations] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [region] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_region_df] DEFAULT 'us',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_status_df] DEFAULT 'active',
    [plan_id] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [organizations_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [organizations_pkey] PRIMARY KEY ([id]),
    CONSTRAINT [organizations_slug_key] UNIQUE ([slug]),
    CONSTRAINT [organizations_plan_id_fkey] FOREIGN KEY ([plan_id]) REFERENCES [dbo].[plans] ([id]) ON DELETE NO ACTION ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(1000) NOT NULL,
    [organization_id] NVARCHAR(1000),
    [email] NVARCHAR(1000) NOT NULL,
    [password_hash] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [users_status_df] DEFAULT 'active',
    [last_login_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [users_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [users_pkey] PRIMARY KEY ([id]),
    CONSTRAINT [users_organization_id_email_key] UNIQUE ([organization_id], [email]),
    CONSTRAINT [users_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations] ([id]) ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE [dbo].[permissions] (
    [id] NVARCHAR(1000) NOT NULL,
    [key] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [permissions_pkey] PRIMARY KEY ([id]),
    CONSTRAINT [permissions_key_key] UNIQUE ([key])
);

-- CreateTable
CREATE TABLE [dbo].[role_permissions] (
    [role] NVARCHAR(1000) NOT NULL,
    [permission_id] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [role_permissions_pkey] PRIMARY KEY ([role], [permission_id]),
    CONSTRAINT [role_permissions_permission_id_fkey] FOREIGN KEY ([permission_id]) REFERENCES [dbo].[permissions] ([id]) ON DELETE NO ACTION ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE [dbo].[refresh_tokens] (
    [id] NVARCHAR(1000) NOT NULL,
    [user_id] NVARCHAR(1000) NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [family_id] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [revoked_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [refresh_tokens_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [refresh_tokens_pkey] PRIMARY KEY ([id]),
    CONSTRAINT [refresh_tokens_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users] ([id]) ON DELETE NO ACTION ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [organization_id] NVARCHAR(1000),
    [actor_user_id] NVARCHAR(1000),
    [action] NVARCHAR(1000) NOT NULL,
    [entity_type] NVARCHAR(1000) NOT NULL,
    [entity_id] NVARCHAR(1000),
    [metadata_json] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY ([id]),
    CONSTRAINT [audit_logs_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations] ([id]) ON DELETE SET NULL ON UPDATE CASCADE
);
