-- Auth hot-path indexes: SQL Server does not auto-index foreign key
-- columns (unlike Postgres), so these must be created explicitly.
--   - refresh_tokens.user_id is looked up on every login-refresh/rotation,
--     the hottest path in the auth flow.
--   - role_permissions.permission_id backs the FK used when resolving a
--     role's permission set (RBAC checks).

-- CreateIndex
CREATE NONCLUSTERED INDEX [refresh_tokens_user_id_idx] ON [dbo].[refresh_tokens]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [role_permissions_permission_id_idx] ON [dbo].[role_permissions]([permission_id]);
