-- Named offer templates (Zoho #9 slice 1): an org can have multiple named templates with
-- one marked default. Each org currently has <=1 template, so backfill makes every existing
-- row its org's default -- safe because org+name is about to become unique and every org
-- has at most one row today.
ALTER TABLE [dbo].[offer_templates] ADD [name] NVARCHAR(200) NOT NULL CONSTRAINT [offer_templates_name_df] DEFAULT (N'Default offer letter');
ALTER TABLE [dbo].[offer_templates] ADD [is_default] BIT NOT NULL CONSTRAINT [offer_templates_is_default_df] DEFAULT 0;

-- offer_templates carries a tenant FILTER + BLOCK PREDICATE RLS policy (dbo.fn_tenant_access_predicate).
-- The migration connection has no session context, unlike app requests, so this cross-tenant UPDATE
-- (touching every org's rows) would be blocked -- bypass RLS the same way 20260904090002_configurable_pipeline_seed
-- and 20260904090003_comms_trigger_stage do.
EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1;

-- is_default was just added by the ALTER above. Prisma's SQL Server migration runner sends this whole
-- file as one batch (no `GO` support), and SQL Server can't resolve a column added by ALTER TABLE ADD
-- against a later statement in that same batch ("Invalid column name 'is_default'", error 207).
-- Dynamic SQL defers parsing until runtime, after the preceding ALTER TABLE has already run.
EXEC(N'UPDATE [dbo].[offer_templates] SET [is_default] = 1;');

EXEC sp_set_session_context @key=N'app_is_super_admin', @value=0;

-- Same same-batch column-resolution constraint as above: [name] was just added in this batch.
EXEC(N'CREATE UNIQUE INDEX [offer_templates_organization_id_name_key] ON [dbo].[offer_templates]([organization_id], [name]);');
