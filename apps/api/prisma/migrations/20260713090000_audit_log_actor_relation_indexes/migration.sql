-- Historical audit_logs rows can reference a since-deleted user (no FK existed on this
-- column before this migration) -- null them out so the new FK's CHECK validation passes,
-- applying the FK's own ON DELETE SET NULL semantics retroactively. The UPDATE itself is
-- subject to this database's row-level security policy (which the migration connection has
-- no session context for, unlike app requests), so bypass it the same way seed.ts does --
-- ALTER TABLE's own constraint validation below is unaffected by RLS either way.
EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1;
UPDATE [dbo].[audit_logs] SET [actor_user_id] = NULL WHERE [actor_user_id] IS NOT NULL AND [actor_user_id] NOT IN (SELECT [id] FROM [dbo].[users]);
EXEC sp_set_session_context @key=N'app_is_super_admin', @value=0;

-- AddForeignKey
-- ON UPDATE NO ACTION (not CASCADE, unlike the sibling FKs on this table) -- a third
-- ON UPDATE CASCADE path from organizations (via users.organization_id -> this FK)
-- would trigger SQL Server error 1785 (multiple cascade paths). ON DELETE SET NULL is
-- unaffected and preserved.
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey] FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_organization_id_created_at_idx] ON [dbo].[audit_logs]([organization_id], [created_at] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_actor_user_id_idx] ON [dbo].[audit_logs]([actor_user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_entity_type_idx] ON [dbo].[audit_logs]([entity_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_action_idx] ON [dbo].[audit_logs]([action]);
