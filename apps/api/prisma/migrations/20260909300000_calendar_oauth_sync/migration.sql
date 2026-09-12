-- Calendar OAuth 2-way sync (Zoho #22, other half): per-user Google/O365 calendar
-- connections + a transient OAuth state store, plus additive columns on interviews to
-- hold the pushed external event id and the auto-generated Meet/Teams link.
--
-- The four new interviews columns are additive and nullable -> no RLS change needed
-- (interviews is already RLS-scoped on organization_id; the predicate is unaffected).
-- calendar_connections IS tenant-scoped -> its RLS predicate lands in the _rls sibling.
-- calendar_oauth_states is NOT RLS-scoped (looked up by state_hash in the JWT-less OAuth
-- callback, exactly like sso_login_codes).

-- Additive columns on interviews (all nullable, no default constraint needed).
ALTER TABLE [dbo].[interviews] ADD
    [external_event_provider] NVARCHAR(1000) NULL,
    [external_event_id] NVARCHAR(MAX) NULL,
    [external_event_owner_id] UNIQUEIDENTIFIER NULL,
    [meeting_url] NVARCHAR(MAX) NULL;

-- CreateTable
CREATE TABLE [dbo].[calendar_connections] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [provider] NVARCHAR(1000) NOT NULL,
    [connected_email] NVARCHAR(1000),
    [access_token_encrypted] NVARCHAR(MAX) NOT NULL,
    [refresh_token_encrypted] NVARCHAR(MAX) NOT NULL,
    [token_expires_at] DATETIME2 NOT NULL,
    [scope] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [calendar_connections_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [calendar_connections_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [calendar_connections_user_id_provider_key] UNIQUE NONCLUSTERED ([user_id], [provider])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [calendar_connections_organization_id_user_id_idx] ON [dbo].[calendar_connections]([organization_id], [user_id]);

-- CreateTable
CREATE TABLE [dbo].[calendar_oauth_states] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [state_hash] NVARCHAR(1000) NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [provider] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [calendar_oauth_states_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [calendar_oauth_states_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [calendar_oauth_states_state_hash_key] UNIQUE NONCLUSTERED ([state_hash])
);
