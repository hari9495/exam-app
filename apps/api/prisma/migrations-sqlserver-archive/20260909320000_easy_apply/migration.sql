-- External Easy Apply (Indeed / LinkedIn) ingestion: per-org encrypted creds keyed by provider,
-- used to verify an inbound apply webhook before funneling it through the normal apply() pipeline.
-- Additive column on organizations (not RLS-scoped) -> no RLS sibling. Inert until an org sets it.
ALTER TABLE [dbo].[organizations] ADD [easy_apply_config_encrypted] NVARCHAR(MAX) NULL;
