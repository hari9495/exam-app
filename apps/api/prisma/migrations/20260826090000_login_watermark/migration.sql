-- Opt-in per-org login watermark: when enabled, the org's logo renders as a tone-on-tone
-- silhouette on the login navy panel. Additive, defaults off so no existing org changes.
ALTER TABLE [dbo].[organizations] ADD [login_watermark_enabled] BIT NOT NULL CONSTRAINT [organizations_login_watermark_enabled_df] DEFAULT 0;
