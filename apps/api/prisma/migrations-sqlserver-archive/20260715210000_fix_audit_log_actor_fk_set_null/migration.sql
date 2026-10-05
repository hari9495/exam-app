-- The FK constraint audit_logs_actor_user_id_fkey had drifted from its documented intent:
-- migration 20260713090000_audit_log_actor_relation_indexes specified ON DELETE SET NULL, but
-- _prisma_migrations shows that migration failed to apply 3 times before a 4th attempt was
-- recorded as applied, and the constraint that actually landed was ON DELETE NO ACTION.
-- Reconciling the live constraint to match the documented/intended behavior.
ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_actor_user_id_fkey];
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey] FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
