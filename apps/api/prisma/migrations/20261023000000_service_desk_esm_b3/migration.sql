-- Service Desk phase 3b-2 (ESM), batch 3 (M14-BUILD-DESIGN §5.3, §9.4, §14.4; slices SD-2.20 … SD-2.27):
--   SD-2.20 help widget: a key per widget, the sites it may run on, the company's own secret that signs its users;
--   SD-2.21 / SD-2.23 WhatsApp and two-way SMS on a desk, through the P04 channel accounts (YukthiX's shared number by
--           default, the company's own account when it adds one); who linked which phone (the opt-in, YX-NTF-14);
--   SD-2.22 Teams / Slack on a desk (people link through the existing channel_links of SD-2.06);
--   SD-2.24 an agent's own mailbox synced for matched threads only;
--   SD-2.25 presence (online, away, busy, offline) with its history, capacity per channel, skills and languages;
--   SD-2.26 dated shifts (the daily volume history is the existing sd_kpi_daily 'created' metric);
--   SD-2.27 an agent's drafts written on the phone (synced, with conflict checks).
-- Every new table: organization_id NOT NULL + forced RLS with the standard tenant_isolation policy, composite keys,
-- nothing readable through an outside portal session; personal rows (phones, mailboxes, drafts, presence) only for
-- their owner, the desk's leads where stated, and the desk's own jobs (sd_system).

-- ---------------------------------------------------------------------------------------------
-- Channels a ticket and a message can come in by.
ALTER TABLE "sd_tickets" DROP CONSTRAINT "sd_tickets_channel_check",
  ADD CONSTRAINT "sd_tickets_channel_check" CHECK ("channel" IN ('portal', 'agent', 'api', 'email', 'chat', 'phone', 'walk_up', 'whatsapp', 'sms', 'teams', 'slack', 'widget'));
ALTER TABLE "sd_ticket_messages" DROP CONSTRAINT "sd_ticket_messages_channel_check",
  ADD CONSTRAINT "sd_ticket_messages_channel_check" CHECK ("channel" IN ('portal', 'agent', 'api', 'email', 'system', 'chat', 'phone', 'walk_up', 'whatsapp', 'sms', 'teams', 'slack', 'widget'));
-- SD-2.25 language routing: the language the requester wrote in (ISO 639 code, e.g. 'hi', 'ta').
ALTER TABLE "sd_tickets" ADD COLUMN "language" VARCHAR(8),
  ADD CONSTRAINT "sd_tickets_language_check" CHECK ("language" IS NULL OR "language" ~ '^[a-z]{2,3}$');
ALTER TABLE "sd_desk_members" ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "sd_desk_members_languages_check" CHECK (cardinality("languages") <= 10);
ALTER TABLE "sd_categories" ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "sd_categories_skills_check" CHECK (cardinality("skills") <= 10);

-- P04 accounts: WhatsApp beside SMS; Meta's Cloud API is a provider.
ALTER TABLE "channel_accounts" DROP CONSTRAINT "channel_accounts_channel_check",
  ADD CONSTRAINT "channel_accounts_channel_check" CHECK ("channel" IN ('sms', 'whatsapp'));
ALTER TABLE "channel_accounts" DROP CONSTRAINT "channel_accounts_provider_check",
  ADD CONSTRAINT "channel_accounts_provider_check" CHECK ("provider" IN ('http', 'twilio', 'dev', 'meta'));
-- The delivery log carries desk replies and notices on every outside channel (idempotent per message and channel).
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_channel_check",
  ADD CONSTRAINT "notification_deliveries_channel_check" CHECK ("channel" IN ('sms', 'email', 'whatsapp', 'teams', 'slack', 'push'));
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_kind_check",
  ADD CONSTRAINT "notification_deliveries_kind_check" CHECK ("kind" IN ('otp', 'test', 'desk_reply', 'desk_notice', 'sla_alert'));

-- SD-2.25 presence: online (available), away, busy, offline.
ALTER TABLE "sd_agent_status" DROP CONSTRAINT "sd_agent_status_status_check",
  ADD CONSTRAINT "sd_agent_status_status_check" CHECK ("status" IN ('available', 'away', 'busy', 'offline'));

-- ---------------------------------------------------------------------------------------------
-- SD-2.21 … SD-2.23: one line per channel kind per company, landing on one desk. account_id null = YukthiX's shared
-- account (WhatsApp number, SMS sender, Teams / Slack app); a company account is its own channel_accounts row.
CREATE TABLE "sd_msg_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "account_id" UUID,
    -- The webhook path token (hashed) and its signing secret (encrypted) for providers we sign for (dev, SMS gateways).
    "token_hash" CHAR(64) NOT NULL,
    "signing_secret_encrypted" TEXT NOT NULL,
    -- WhatsApp: { reply_notice: { name, language, status } }; SMS: { reply_notice: { dltTemplateId, body, status } }.
    "templates" JSONB NOT NULL DEFAULT '{}',
    "state" VARCHAR(8) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_msg_channels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_msg_channels_kind_key" UNIQUE ("organization_id", "kind"),
    CONSTRAINT "sd_msg_channels_token_key" UNIQUE ("token_hash"),
    CONSTRAINT "sd_msg_channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_msg_channels_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_msg_channels_account_fkey" FOREIGN KEY ("account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL,
    CONSTRAINT "sd_msg_channels_kind_check" CHECK ("kind" IN ('whatsapp', 'sms', 'teams', 'slack')),
    CONSTRAINT "sd_msg_channels_state_check" CHECK ("state" IN ('active', 'paused')),
    CONSTRAINT "sd_msg_channels_templates_check" CHECK (jsonb_typeof("templates") = 'object')
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_msg_channels" FROM app_runtime;

-- A person's phone linked to a channel (WhatsApp or SMS): the opt-in (channel_consents row) and how we reach them.
-- The number is kept encrypted (to send) and as an HMAC (to find the sender of an incoming message).
CREATE TABLE "sd_msg_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "user_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "address_hash" CHAR(64) NOT NULL,
    "address_masked" VARCHAR(40) NOT NULL,
    "address_encrypted" TEXT NOT NULL,
    "consent_id" UUID NOT NULL,
    "state" VARCHAR(8) NOT NULL DEFAULT 'active',
    -- WhatsApp's 24-hour window opens with the person's last message.
    "last_inbound_at" TIMESTAMPTZ(3),
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stopped_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_msg_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_msg_identities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_msg_identities_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_msg_identities_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_msg_identities_consent_fkey" FOREIGN KEY ("consent_id") REFERENCES "channel_consents"("id"),
    CONSTRAINT "sd_msg_identities_kind_check" CHECK ("kind" IN ('whatsapp', 'sms')),
    CONSTRAINT "sd_msg_identities_state_check" CHECK ("state" IN ('active', 'stopped')),
    CONSTRAINT "sd_msg_identities_stop_check" CHECK (("state" = 'stopped') = ("stopped_at" IS NOT NULL))
);
-- One active link per phone and channel kind across every company (the shared YukthiX number routes by it).
CREATE UNIQUE INDEX "sd_msg_identities_address_key" ON "sd_msg_identities"("kind", "address_hash") WHERE "state" = 'active';
CREATE UNIQUE INDEX "sd_msg_identities_user_key" ON "sd_msg_identities"("organization_id", "kind", "user_id") WHERE "state" = 'active';
REVOKE DELETE, TRUNCATE ON TABLE "sd_msg_identities" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-2.20 (US-G-069): an embeddable help widget on a company's own site or app. It opens one outside portal; a signed-in
-- user of the company's site arrives with a short-lived token the company's server signs with the widget's secret.
CREATE TABLE "sd_widgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "portal_id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "allowed_origins" TEXT[] NOT NULL DEFAULT '{}',
    "identity_secret_encrypted" TEXT NOT NULL,
    -- Visitors who are not signed in may read public articles (never raise or read tickets).
    "allow_anonymous" BOOLEAN NOT NULL DEFAULT false,
    -- The mobile SDKs call without a browser origin.
    "mobile" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(8) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_widgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_widgets_key_key" UNIQUE ("key"),
    CONSTRAINT "sd_widgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_widgets_portal_fkey" FOREIGN KEY ("organization_id", "portal_id") REFERENCES "sd_portals"("organization_id", "id"),
    CONSTRAINT "sd_widgets_key_check" CHECK ("key" ~ '^wk_[A-Za-z0-9_-]{20,36}$'),
    CONSTRAINT "sd_widgets_origins_check" CHECK (cardinality("allowed_origins") <= 20),
    CONSTRAINT "sd_widgets_state_check" CHECK ("state" IN ('active', 'paused'))
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_widgets" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-2.25 (US-G-075): presence history for the availability report (the live state is sd_agent_status), and how much
-- work of each kind an agent takes at once.
CREATE TABLE "sd_agent_presence_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_agent_presence_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_agent_presence_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_agent_presence_log_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_agent_presence_log_status_check" CHECK ("status" IN ('available', 'away', 'busy', 'offline')),
    CONSTRAINT "sd_agent_presence_log_range_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);
CREATE INDEX "sd_agent_presence_log_user_idx" ON "sd_agent_presence_log"("organization_id", "user_id", "started_at" DESC);
CREATE UNIQUE INDEX "sd_agent_presence_log_open_key" ON "sd_agent_presence_log"("organization_id", "user_id") WHERE "ended_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "sd_agent_presence_log" FROM app_runtime;

CREATE TABLE "sd_agent_capacity" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    -- ticket = open tickets owned; chat = live chats at once; messaging = open WhatsApp / SMS / Teams / Slack tickets.
    "channel" VARCHAR(10) NOT NULL,
    "max_open" SMALLINT NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_agent_capacity_pkey" PRIMARY KEY ("organization_id", "user_id", "channel"),
    CONSTRAINT "sd_agent_capacity_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_agent_capacity_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_agent_capacity_channel_check" CHECK ("channel" IN ('ticket', 'chat', 'messaging')),
    CONSTRAINT "sd_agent_capacity_max_check" CHECK ("max_open" BETWEEN 0 AND 500)
);

-- ---------------------------------------------------------------------------------------------
-- SD-2.26 (US-G-076): dated shifts per desk (the roster). An agent with a shift today gets pushed work only inside it.
CREATE TABLE "sd_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "note" VARCHAR(200),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_shifts_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_shifts_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_shifts_range_check" CHECK ("ends_at" > "starts_at" AND "ends_at" - "starts_at" <= interval '16 hours')
);
CREATE INDEX "sd_shifts_desk_idx" ON "sd_shifts"("organization_id", "desk_id", "starts_at");
CREATE INDEX "sd_shifts_user_idx" ON "sd_shifts"("organization_id", "user_id", "starts_at");
-- Two shifts of one person never overlap.
CREATE FUNCTION sd_shifts_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('sd-shift:' || NEW.organization_id || ':' || NEW.user_id));
  IF EXISTS (SELECT 1 FROM sd_shifts s WHERE s.organization_id = NEW.organization_id AND s.user_id = NEW.user_id AND s.id <> NEW.id
             AND s.starts_at < NEW.ends_at AND NEW.starts_at < s.ends_at) THEN
    RAISE EXCEPTION 'sd_shifts: overlapping shift' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_shifts_no_overlap BEFORE INSERT OR UPDATE ON "sd_shifts" FOR EACH ROW EXECUTE FUNCTION sd_shifts_no_overlap();

-- ---------------------------------------------------------------------------------------------
-- SD-2.24 (US-E-283, YX-INT-06): an agent's own mailbox, synced for threads that match a ticket only. The grant is the
-- agent's own (Microsoft 365 / Gmail); unlinking wipes it at once.
CREATE TABLE "sd_agent_mailboxes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "address" VARCHAR(254) NOT NULL,
    "config_encrypted" TEXT,
    "cursor" VARCHAR(100),
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "last_sync_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(300),
    "imported" INTEGER NOT NULL DEFAULT 0,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_agent_mailboxes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_agent_mailboxes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_agent_mailboxes_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_agent_mailboxes_kind_check" CHECK ("kind" IN ('m365', 'gmail', 'dev')),
    CONSTRAINT "sd_agent_mailboxes_status_check" CHECK ("status" IN ('active', 'failing', 'unlinked')),
    CONSTRAINT "sd_agent_mailboxes_unlink_check" CHECK (("status" = 'unlinked') = ("unlinked_at" IS NOT NULL AND "config_encrypted" IS NULL))
);
CREATE UNIQUE INDEX "sd_agent_mailboxes_user_key" ON "sd_agent_mailboxes"("organization_id", "user_id") WHERE "status" <> 'unlinked';
REVOKE DELETE, TRUNCATE ON TABLE "sd_agent_mailboxes" FROM app_runtime;

-- A synced email lands once per ticket (the same thread seen by two agents' mailboxes is one note).
CREATE UNIQUE INDEX "sd_ticket_messages_synced_key" ON "sd_ticket_messages"("organization_id", "ticket_id", "email_message_id") WHERE "email_message_id" IS NOT NULL AND "kind" = 'note';

-- ---------------------------------------------------------------------------------------------
-- SD-2.27 (US-G-068): drafts an agent writes on the phone, kept on the server so another device sees them. version
-- guards two devices; base_ticket_version says what the agent saw, so a send after the ticket changed is a conflict.
CREATE TABLE "sd_agent_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_ref" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(5) NOT NULL,
    "body_html" TEXT NOT NULL,
    "base_ticket_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_agent_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_agent_drafts_ref_key" UNIQUE ("organization_id", "user_id", "client_ref"),
    CONSTRAINT "sd_agent_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_agent_drafts_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_agent_drafts_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_agent_drafts_kind_check" CHECK ("kind" IN ('reply', 'note')),
    CONSTRAINT "sd_agent_drafts_ref_check" CHECK ("client_ref" ~ '^[A-Za-z0-9_-]{8,64}$'),
    CONSTRAINT "sd_agent_drafts_body_check" CHECK (char_length("body_html") <= 100000)
);

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14, §5.1) on every new table; nothing of this is read through an outside portal session.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_msg_channels', 'sd_msg_identities', 'sd_widgets', 'sd_agent_presence_log', 'sd_agent_capacity',
    'sd_shifts', 'sd_agent_mailboxes', 'sd_agent_drafts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format('CREATE POLICY sd_portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;

-- A lead of a desk where this person holds an agent or lead seat today (presence, capacity and shifts are theirs to plan).
CREATE FUNCTION sd_leads_user(p_org uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM sd_desk_members l JOIN sd_desk_members m ON m.organization_id = l.organization_id AND m.desk_id = l.desk_id
    WHERE l.organization_id = p_org AND l.user_id = app_current_user_id() AND l.role = 'lead' AND m.user_id = p_user AND m.role IN ('agent', 'lead')
      AND l.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date AND (l.valid_to IS NULL OR l.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
      AND m.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date AND (m.valid_to IS NULL OR m.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date))
$$;

-- Phones, mailboxes and drafts: their owner and the desk's own jobs only (never a lead, an admin or YukthiX staff).
CREATE POLICY sd_owner_only ON "sd_msg_identities" AS RESTRICTIVE USING (sd_system() OR user_id = app_current_user_id());
CREATE POLICY sd_owner_only ON "sd_agent_mailboxes" AS RESTRICTIVE USING (sd_system() OR user_id = app_current_user_id());
CREATE POLICY sd_owner_only ON "sd_agent_drafts" AS RESTRICTIVE USING (sd_system() OR user_id = app_current_user_id());
-- Presence, capacity and shifts: the person, the leads of their desks, the desk's jobs.
CREATE POLICY sd_team_only ON "sd_agent_presence_log" AS RESTRICTIVE USING (sd_system() OR user_id = app_current_user_id() OR sd_leads_user(organization_id, user_id));
CREATE POLICY sd_team_only ON "sd_agent_capacity" AS RESTRICTIVE USING (sd_system() OR user_id = app_current_user_id() OR sd_leads_user(organization_id, user_id));
CREATE POLICY sd_team_only ON "sd_shifts" AS RESTRICTIVE USING (sd_system() OR user_id = app_current_user_id() OR sd_leads_user(organization_id, user_id));
