-- P04 Notification engine, SMS channel (§4.4, §4.5a, §5; YX-NTF-07/10/11/12/13/14). Provider-agnostic
-- (founder decision 6 Oct 2026): any gateway by configuration. One-time codes use it first; the full
-- engine reuses these tables.

-- Gateway accounts. organization_id NULL = the YukthiX shared account (platform only: the standard
-- tenant_isolation policy below never matches a NULL organisation for a tenant).
CREATE TABLE "channel_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "channel" VARCHAR(16) NOT NULL DEFAULT 'sms',
    "provider" VARCHAR(16) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- AES-256-GCM (OrgSecretsCryptoService): the provider config including its secrets; never returned.
    "config_encrypted" TEXT NOT NULL,
    -- DLT sender header (India) or sender id / number.
    "sender" VARCHAR(20),
    "dlt_entity_id" VARCHAR(30),
    -- DLT-registered templates by message type, e.g. {"otp": {dltTemplateId, body, variables, status}}.
    "templates" JSONB NOT NULL DEFAULT '{}',
    -- Lower first; the shared account is tried after a company's own accounts.
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "channel_accounts_organization_id_channel_priority_idx" ON "channel_accounts"("organization_id", "channel", "priority");
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_accounts"
  ADD CONSTRAINT "channel_accounts_channel_check" CHECK ("channel" IN ('sms')),
  ADD CONSTRAINT "channel_accounts_provider_check" CHECK ("provider" IN ('http', 'twilio', 'dev')),
  ADD CONSTRAINT "channel_accounts_status_check" CHECK ("status" IN ('active', 'disabled')),
  ADD CONSTRAINT "channel_accounts_priority_check" CHECK ("priority" BETWEEN 0 AND 1000),
  ADD CONSTRAINT "channel_accounts_templates_check" CHECK (jsonb_typeof("templates") = 'object');

-- One row per delivery attempt chain (P04 §5 subset). The idempotency key makes a retried job a no-op
-- (YX-NTF-02); the address is kept masked, plus a keyed hash for opt-out matching.
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "notification_id" UUID,
    "channel" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "address_masked" VARCHAR(40) NOT NULL,
    "address_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "channel_account_id" UUID,
    "provider" VARCHAR(16),
    "provider_msg_id" VARCHAR(200),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(500),
    "cost_units" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_deliveries_idempotency_key_key" ON "notification_deliveries"("idempotency_key");
CREATE INDEX "notification_deliveries_organization_id_created_at_idx" ON "notification_deliveries"("organization_id", "created_at" DESC);
CREATE INDEX "notification_deliveries_channel_account_id_provider_msg_id_idx" ON "notification_deliveries"("channel_account_id", "provider_msg_id");
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_account_id_fkey"
  FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_channel_check" CHECK ("channel" IN ('sms', 'email')),
  ADD CONSTRAINT "notification_deliveries_kind_check" CHECK ("kind" IN ('otp', 'test')),
  ADD CONSTRAINT "notification_deliveries_status_check" CHECK ("status" IN ('pending', 'sent', 'delivered', 'failed', 'fallback', 'unknown', 'opted_out')),
  ADD CONSTRAINT "notification_deliveries_attempts_check" CHECK ("attempts" BETWEEN 0 AND 100),
  ADD CONSTRAINT "notification_deliveries_cost_units_check" CHECK ("cost_units" >= 0);
-- The delivery log is evidence (YX-NTF-10): the app never deletes it (a company's removal cascades as owner).
REVOKE DELETE, TRUNCATE ON TABLE "notification_deliveries" FROM app_runtime;

-- WhatsApp / SMS opt-in records (APX-A §5, YX-NTF-14). Append-only: the app may only stamp a withdrawal
-- once (column grant + trigger below); a re-opt-in is a new row.
CREATE TABLE "channel_consents" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "recipient_type" VARCHAR(32) NOT NULL,
    "recipient_id" UUID,
    "channel" VARCHAR(16) NOT NULL,
    "address_hash" VARCHAR(64) NOT NULL,
    "address_masked" VARCHAR(40),
    "scope" VARCHAR(32) NOT NULL DEFAULT 'all_service',
    "source" VARCHAR(32) NOT NULL,
    "text_version" VARCHAR(32) NOT NULL,
    "language" VARCHAR(8) NOT NULL DEFAULT 'en',
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_by" UUID,
    "evidence" JSONB,
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawal_source" VARCHAR(32),

    CONSTRAINT "channel_consents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "channel_consents_organization_id_channel_address_hash_idx" ON "channel_consents"("organization_id", "channel", "address_hash");
ALTER TABLE "channel_consents" ADD CONSTRAINT "channel_consents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_consents"
  ADD CONSTRAINT "channel_consents_channel_check" CHECK ("channel" IN ('sms', 'whatsapp')),
  ADD CONSTRAINT "channel_consents_scope_check" CHECK ("scope" IN ('all_service', 'authentication_only')),
  ADD CONSTRAINT "channel_consents_withdrawal_check" CHECK (("withdrawn_at" IS NULL) = ("withdrawal_source" IS NULL)),
  ADD CONSTRAINT "channel_consents_withdrawal_source_check" CHECK (
    "withdrawal_source" IS NULL OR "withdrawal_source" IN ('stop_keyword', 'me_settings', 'hr', 'provider_callback'));
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "channel_consents" FROM app_runtime;
GRANT UPDATE ("withdrawn_at", "withdrawal_source") ON TABLE "channel_consents" TO app_runtime;
CREATE FUNCTION channel_consents_withdraw_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'channel_consents is append-only: a withdrawal is recorded once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER channel_consents_withdraw_once BEFORE UPDATE ON "channel_consents"
  FOR EACH ROW EXECUTE FUNCTION channel_consents_withdraw_once();

-- The company's notification policy (P04 §4.7 tenant policy): SMS through the YukthiX shared account,
-- and a monthly SMS cap (Q3, YX-NTF-12). The engine adds quiet hours and channel switches here.
CREATE TABLE "tenant_notification_policies" (
    "organization_id" UUID NOT NULL,
    "sms_shared_account" BOOLEAN NOT NULL DEFAULT true,
    "sms_monthly_cap" INTEGER,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_user_id" UUID,

    CONSTRAINT "tenant_notification_policies_pkey" PRIMARY KEY ("organization_id")
);
ALTER TABLE "tenant_notification_policies" ADD CONSTRAINT "tenant_notification_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_notification_policies"
  ADD CONSTRAINT "tnp_sms_monthly_cap_check" CHECK ("sms_monthly_cap" IS NULL OR "sms_monthly_cap" BETWEEN 0 AND 10000000);

-- SMS metering per company per month (YX-NTF-12): the counter a send reserves before it goes.
CREATE TABLE "sms_usage_monthly" (
    "organization_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "cap_alerted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sms_usage_monthly_pkey" PRIMARY KEY ("organization_id", "month")
);
ALTER TABLE "sms_usage_monthly" ADD CONSTRAINT "sms_usage_monthly_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_usage_monthly" ADD CONSTRAINT "sms_usage_monthly_sent_count_check" CHECK ("sent_count" >= 0);

-- Tenant isolation: the standard forced RLS + tenant_isolation policy (NULL organisation = platform only).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['channel_accounts', 'notification_deliveries', 'channel_consents', 'tenant_notification_policies', 'sms_usage_monthly']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
