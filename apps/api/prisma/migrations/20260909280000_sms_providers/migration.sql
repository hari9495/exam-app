-- SMS providers (Zoho #16 follow-up): replace the Twilio-only org config columns
-- (sms_account_sid, sms_auth_token_encrypted, sms_from_number — added undeployed in
-- 20260909270000, no data, no default constraints on them) with a provider selector +
-- a single encrypted JSON config blob. sms_enabled is unchanged. No RLS impact
-- (organizations is not RLS-scoped); no seed.
ALTER TABLE [dbo].[organizations] DROP COLUMN [sms_account_sid], [sms_auth_token_encrypted], [sms_from_number];
ALTER TABLE [dbo].[organizations] ADD [sms_provider] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_organizations_sms_provider] DEFAULT 'twilio', [sms_config_encrypted] NVARCHAR(MAX) NULL;
