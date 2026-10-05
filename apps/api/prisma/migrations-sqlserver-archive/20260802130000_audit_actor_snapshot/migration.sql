-- Snapshot the actor's identity onto each audit row at write time. Nullable so
-- existing rows are unaffected (they keep resolving via the live actor relation
-- where possible). New rows capture email/name/role so a super-admin actor is
-- never rendered as "System" to an org-admin viewer, and so the trail survives
-- the actor being renamed or deleted.
ALTER TABLE [dbo].[audit_logs] ADD [actor_email] NVARCHAR(255) NULL;
ALTER TABLE [dbo].[audit_logs] ADD [actor_name] NVARCHAR(255) NULL;
ALTER TABLE [dbo].[audit_logs] ADD [actor_role] NVARCHAR(64) NULL;
