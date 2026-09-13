-- Per-org role permission overrides (Salesforce-style role editing): a row for (org, role) replaces
-- the global role_permissions default for that role in that org. Tenant-scoped -> RLS predicate in
-- the _rls sibling. permissions_json is a JSON key array, same shape as permission_profiles.
CREATE TABLE [dbo].[org_role_permissions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [org_role_permissions_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [permissions_json] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [org_role_permissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [org_role_permissions_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [org_role_permissions_organization_id_role_key] ON [dbo].[org_role_permissions]([organization_id], [role]);
CREATE NONCLUSTERED INDEX [org_role_permissions_organization_id_idx] ON [dbo].[org_role_permissions]([organization_id]);
