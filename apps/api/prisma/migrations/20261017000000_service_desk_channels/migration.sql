-- Service Desk phase 3b-1, batch 3 (M14-BUILD-DESIGN §5.2 "Email and portal" and "Customers", §9, §14.3, §14.4;
-- slices SD-1.18 … SD-1.23 and SD-1.28): sending domains with DKIM keys, desk mailboxes (hosted webhook, forward,
-- Microsoft 365, Gmail, IMAP), every inbound email with its SPF / DKIM / DMARC / ARC verdicts, email rules, the bounce
-- list; customer portals with external requesters signing in by one-time code, open-portal requests confirmed by an
-- email link; known-issue banners with "me too"; customer accounts, contacts, entitlements, products and agent
-- account scope.
--
-- Every new table: organization_id NOT NULL + forced RLS with the standard tenant_isolation policy, composite keys.
-- External requesters (portal sessions) never get a users row: the API sets app.portal_person_id inside their
-- transaction and the restrictive policies below keep them to their own records (YX-SD-16, YX-SEC-21).

-- ---------------------------------------------------------------------------------------------
-- SD-1.28 customers (US-G-035 … US-G-038, US-G-221). A company group is a parent account with sub-accounts.
CREATE TABLE "sd_customer_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    -- New contacts writing from these domains join this account (US-G-221). Lower case, checked by the API.
    "email_domains" TEXT[] NOT NULL DEFAULT '{}',
    "owner_user_id" UUID,
    "parent_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_customer_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_customer_accounts_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_customer_accounts_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "sd_customer_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_customer_accounts_owner_fkey" FOREIGN KEY ("organization_id", "owner_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_customer_accounts_parent_fkey" FOREIGN KEY ("organization_id", "parent_id") REFERENCES "sd_customer_accounts"("organization_id", "id"),
    CONSTRAINT "sd_customer_accounts_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
    CONSTRAINT "sd_customer_accounts_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
    CONSTRAINT "sd_customer_accounts_domains_check" CHECK (cardinality("email_domains") <= 20),
    CONSTRAINT "sd_customer_accounts_status_check" CHECK ("status" IN ('active', 'inactive'))
);
CREATE INDEX "sd_customer_accounts_domains_idx" ON "sd_customer_accounts" USING gin ("email_domains");
REVOKE DELETE, TRUNCATE ON TABLE "sd_customer_accounts" FROM app_runtime;

-- A person can be a contact of several accounts; a contact with no account yet has account_id NULL. A customer admin
-- contact (sees_account_tickets) sees and follows every ticket of the account in the portal (US-G-035).
CREATE TABLE "sd_customer_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "account_id" UUID,
    "person_id" UUID NOT NULL,
    "role" VARCHAR(10) NOT NULL DEFAULT 'member',
    "sees_account_tickets" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_customer_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_customer_contacts_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_customer_contacts_key" UNIQUE NULLS NOT DISTINCT ("organization_id", "account_id", "person_id"),
    CONSTRAINT "sd_customer_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_customer_contacts_account_fkey" FOREIGN KEY ("organization_id", "account_id") REFERENCES "sd_customer_accounts"("organization_id", "id"),
    CONSTRAINT "sd_customer_contacts_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_customer_contacts_role_check" CHECK ("role" IN ('primary', 'billing', 'technical', 'member')),
    CONSTRAINT "sd_customer_contacts_status_check" CHECK ("status" IN ('active', 'inactive'))
);
CREATE INDEX "sd_customer_contacts_person_idx" ON "sd_customer_contacts"("organization_id", "person_id");
REVOKE DELETE, TRUNCATE ON TABLE "sd_customer_contacts" FROM app_runtime;

-- Support plans, effective-dated (§5.6): a ticket copies the plan's tier when it is raised (US-G-036).
CREATE TABLE "sd_entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "plan" VARCHAR(60) NOT NULL,
    "tier" VARCHAR(40) NOT NULL,
    "tickets_allowed" INTEGER,
    "hours_allowed" INTEGER,
    "channels" TEXT[] NOT NULL DEFAULT '{email,portal}',
    -- What happens to a new ticket once the allowance is used up: flag it, or hold it for the account owner.
    "when_used_up" VARCHAR(6) NOT NULL DEFAULT 'flag',
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_entitlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_entitlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_entitlements_account_fkey" FOREIGN KEY ("organization_id", "account_id") REFERENCES "sd_customer_accounts"("organization_id", "id"),
    CONSTRAINT "sd_entitlements_plan_check" CHECK (char_length(btrim("plan")) BETWEEN 1 AND 60 AND "tier" ~ '^[a-z][a-z0-9_-]{0,39}$'),
    CONSTRAINT "sd_entitlements_allowance_check" CHECK (("tickets_allowed" IS NULL OR "tickets_allowed" >= 0) AND ("hours_allowed" IS NULL OR "hours_allowed" >= 0)),
    CONSTRAINT "sd_entitlements_used_up_check" CHECK ("when_used_up" IN ('flag', 'hold')),
    CONSTRAINT "sd_entitlements_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "sd_entitlements_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, "account_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_entitlements" FROM app_runtime;
-- A plan is only ever closed (valid_to), never rewritten.
GRANT UPDATE ("valid_to") ON TABLE "sd_entitlements" TO app_runtime;

CREATE TABLE "sd_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "desk_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_products_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_products_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "sd_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_products_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_products_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_products" FROM app_runtime;

-- US-G-037: an agent limited to some accounts (and their sub-accounts) on Customer support desks.
CREATE TABLE "sd_agent_account_scope" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_agent_account_scope_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_agent_account_scope_key" UNIQUE ("organization_id", "user_id", "account_id"),
    CONSTRAINT "sd_agent_account_scope_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_agent_account_scope_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_agent_account_scope_account_fkey" FOREIGN KEY ("organization_id", "account_id") REFERENCES "sd_customer_accounts"("organization_id", "id")
);

-- Ticket columns: the customer's account, product and plan tier (copied when raised, like an SLA version pin), and
-- whether the sender of an email ticket was proven (§14.3: "sender not verified" shows on screen).
ALTER TABLE "sd_tickets"
    ADD COLUMN "customer_account_id" UUID,
    ADD COLUMN "product_id" UUID,
    ADD COLUMN "plan_tier" VARCHAR(40),
    ADD COLUMN "sender_verified" BOOLEAN NOT NULL DEFAULT true,
    ADD CONSTRAINT "sd_tickets_account_fkey" FOREIGN KEY ("organization_id", "customer_account_id") REFERENCES "sd_customer_accounts"("organization_id", "id"),
    ADD CONSTRAINT "sd_tickets_product_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "sd_products"("organization_id", "id");
CREATE INDEX "sd_tickets_account_idx" ON "sd_tickets"("organization_id", "customer_account_id") WHERE "customer_account_id" IS NOT NULL;

-- Email threading (§9.1 step 6): our outgoing Message-ID and the incoming one on each message.
ALTER TABLE "sd_ticket_messages"
    ADD COLUMN "email_message_id" VARCHAR(300),
    ADD COLUMN "sender_verified" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "inbound_email_id" UUID;
CREATE INDEX "sd_ticket_messages_email_idx" ON "sd_ticket_messages"("organization_id", "email_message_id") WHERE "email_message_id" IS NOT NULL;

-- Founder decision 8 Oct 2026 (health words on HR desks): masked values keep their place in the message so they can be
-- put back for the people allowed to see them.
ALTER TABLE "sd_sensitive_values" ADD COLUMN "seq" SMALLINT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------------------------
-- SD-1.18 email out (US-G-017). The DKIM private key is kept encrypted (org-secrets key) until the secrets manager
-- lands (GO-LIVE-CHECKLIST: desk email); the public key is what the company publishes in DNS.
CREATE TABLE "sd_sending_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "domain" CITEXT NOT NULL,
    "dkim_selector" VARCHAR(63) NOT NULL DEFAULT 'yukthix',
    "dkim_private_key_encrypted" TEXT NOT NULL,
    "dkim_public_key" TEXT NOT NULL,
    "spf_ok" BOOLEAN NOT NULL DEFAULT false,
    "dkim_ok" BOOLEAN NOT NULL DEFAULT false,
    "dmarc_ok" BOOLEAN NOT NULL DEFAULT false,
    "check_detail" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "last_checked_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sending_domains_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sending_domains_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_sending_domains_domain_key" UNIQUE ("organization_id", "domain"),
    CONSTRAINT "sd_sending_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sending_domains_domain_check" CHECK ("domain" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
    CONSTRAINT "sd_sending_domains_selector_check" CHECK ("dkim_selector" ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    CONSTRAINT "sd_sending_domains_status_check" CHECK ("status" IN ('pending', 'verified', 'failed'))
);

-- Desk mailboxes (§9.1). Hosted / forward: the provider posts raw MIME to /desk/inbound/email/<org>/<token>, signed
-- with the mailbox's own secret. m365 / gmail / imap: polled with the company's own credentials (config_encrypted).
CREATE TABLE "sd_mailboxes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "address" CITEXT NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "display_name" VARCHAR(100),
    -- sha256 of the token in the webhook path; the token is shown once.
    "token_hash" CHAR(64),
    "signing_secret_encrypted" TEXT,
    "config_encrypted" TEXT,
    "sending_domain_id" UUID,
    "default_category_id" UUID,
    "default_type_id" UUID,
    "default_template_id" UUID,
    "auto_ack" BOOLEAN NOT NULL DEFAULT true,
    "ack_text" VARCHAR(2000),
    -- §14.3 ARC: forwarders whose ARC seal the company trusts (their domains).
    "trusted_forwarders" TEXT[] NOT NULL DEFAULT '{}',
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "poll_cursor" VARCHAR(500),
    "last_polled_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_mailboxes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_mailboxes_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_mailboxes_address_key" UNIQUE ("organization_id", "address"),
    CONSTRAINT "sd_mailboxes_token_key" UNIQUE ("organization_id", "token_hash"),
    CONSTRAINT "sd_mailboxes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_mailboxes_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_mailboxes_domain_fkey" FOREIGN KEY ("organization_id", "sending_domain_id") REFERENCES "sd_sending_domains"("organization_id", "id"),
    CONSTRAINT "sd_mailboxes_category_fkey" FOREIGN KEY ("organization_id", "desk_id", "default_category_id") REFERENCES "sd_categories"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_mailboxes_type_fkey" FOREIGN KEY ("organization_id", "desk_id", "default_type_id") REFERENCES "sd_ticket_types"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_mailboxes_address_check" CHECK ("address" ~ '^[^@\s+]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT "sd_mailboxes_kind_check" CHECK ("kind" IN ('hosted', 'forward', 'm365_oauth', 'gmail_oauth', 'imap')),
    CONSTRAINT "sd_mailboxes_status_check" CHECK ("status" IN ('active', 'paused', 'error')),
    CONSTRAINT "sd_mailboxes_forwarders_check" CHECK (cardinality("trusted_forwarders") <= 10)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_mailboxes" FROM app_runtime;

-- Every inbound email (§9.1): the raw MIME is kept 30 days for proof, then only this metadata (raw_blob_key cleared).
-- Idempotent on (mailbox, Message-ID): a provider retry never makes a second ticket.
CREATE TABLE "sd_inbound_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "mailbox_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "raw_blob_key" VARCHAR(500),
    "message_id" VARCHAR(300) NOT NULL,
    "from_address" CITEXT,
    "from_name" VARCHAR(200),
    "to_addresses" TEXT[] NOT NULL DEFAULT '{}',
    "subject" VARCHAR(300),
    "remote_ip" VARCHAR(45),
    "spf" VARCHAR(12),
    "dkim" VARCHAR(12),
    "dmarc" VARCHAR(12),
    "dmarc_policy" VARCHAR(12),
    "arc" VARCHAR(12),
    "sender_verified" BOOLEAN NOT NULL DEFAULT false,
    -- A passing DKIM signature aligned with the From domain (email commands need it).
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "flags" TEXT[] NOT NULL DEFAULT '{}',
    "verdict" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "reason" VARCHAR(300),
    "ticket_id" UUID,
    "message_row_id" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "released_by" UUID,
    "released_at" TIMESTAMPTZ(3),
    "raw_purge_after" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '30 days'),

    CONSTRAINT "sd_inbound_emails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_inbound_emails_message_key" UNIQUE ("organization_id", "mailbox_id", "message_id"),
    CONSTRAINT "sd_inbound_emails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_inbound_emails_mailbox_fkey" FOREIGN KEY ("organization_id", "mailbox_id") REFERENCES "sd_mailboxes"("organization_id", "id"),
    CONSTRAINT "sd_inbound_emails_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_inbound_emails_ticket_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "id"),
    CONSTRAINT "sd_inbound_emails_verdict_check" CHECK ("verdict" IN ('pending', 'accepted', 'held', 'rejected', 'loop', 'spam', 'bounce'))
);
CREATE INDEX "sd_inbound_emails_state_idx" ON "sd_inbound_emails"("organization_id", "desk_id", "verdict", "received_at");
CREATE INDEX "sd_inbound_emails_sender_idx" ON "sd_inbound_emails"("organization_id", "from_address", "received_at");
CREATE INDEX "sd_inbound_emails_msgid_idx" ON "sd_inbound_emails"("organization_id", "message_id");
REVOKE DELETE, TRUNCATE ON TABLE "sd_inbound_emails" FROM app_runtime;

-- US-G-018 rules on incoming email, run in order before the email becomes a ticket. Plain text matches only (no
-- regular expressions on mail an outsider writes, so a rule can never be made to run for ever).
CREATE TABLE "sd_email_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "mailbox_id" UUID NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "name" VARCHAR(100) NOT NULL,
    "field" VARCHAR(8) NOT NULL,
    "header_name" VARCHAR(100),
    "op" VARCHAR(12) NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "action" VARCHAR(12) NOT NULL,
    "action_value" JSONB NOT NULL DEFAULT '{}',
    "stop" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_email_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_email_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_email_rules_mailbox_fkey" FOREIGN KEY ("organization_id", "mailbox_id") REFERENCES "sd_mailboxes"("organization_id", "id"),
    CONSTRAINT "sd_email_rules_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_email_rules_field_check" CHECK ("field" IN ('from', 'domain', 'to', 'subject', 'body', 'header') AND (("field" = 'header') = ("header_name" IS NOT NULL))),
    CONSTRAINT "sd_email_rules_op_check" CHECK ("op" IN ('contains', 'equals', 'starts_with', 'ends_with')),
    CONSTRAINT "sd_email_rules_action_check" CHECK ("action" IN ('route', 'tag', 'priority', 'reject', 'spam', 'parse_field'))
);

-- The bounce list (US-G-017): addresses that bounced or complained. Desk mail is not sent to them until cleared.
CREATE TABLE "sd_email_suppressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "address" CITEXT NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "reason" VARCHAR(300),
    "mailbox_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_at" TIMESTAMPTZ(3),
    "cleared_by" UUID,

    CONSTRAINT "sd_email_suppressions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_email_suppressions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_email_suppressions_mailbox_fkey" FOREIGN KEY ("organization_id", "mailbox_id") REFERENCES "sd_mailboxes"("organization_id", "id"),
    CONSTRAINT "sd_email_suppressions_kind_check" CHECK ("kind" IN ('bounce', 'complaint'))
);
CREATE UNIQUE INDEX "sd_email_suppressions_active_key" ON "sd_email_suppressions"("organization_id", "address") WHERE "cleared_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "sd_email_suppressions" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-1.21 / SD-1.22 portals (US-B-099, US-G-021, US-G-022). Address: /yx/portal/<company slug>/<portal slug>.
CREATE TABLE "sd_portals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- closed: only contacts the desk added; allowed_domains: also new people from these email domains; open: anyone.
    "sign_up" VARCHAR(16) NOT NULL DEFAULT 'closed',
    "allowed_domains" TEXT[] NOT NULL DEFAULT '{}',
    -- Raise without signing in, confirmed by an email link (US-G-021).
    "open_requests" BOOLEAN NOT NULL DEFAULT false,
    "accent_colour" VARCHAR(7) NOT NULL DEFAULT '#2563eb',
    "login_title" VARCHAR(100),
    "login_text" VARCHAR(500),
    "reading_aids" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_portals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_portals_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_portals_slug_key" UNIQUE ("organization_id", "slug"),
    CONSTRAINT "sd_portals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_portals_slug_check" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
    CONSTRAINT "sd_portals_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_portals_sign_up_check" CHECK ("sign_up" IN ('closed', 'allowed_domains', 'open')),
    CONSTRAINT "sd_portals_colour_check" CHECK ("accent_colour" ~ '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT "sd_portals_domains_check" CHECK (cardinality("allowed_domains") <= 20),
    CONSTRAINT "sd_portals_status_check" CHECK ("status" IN ('active', 'off'))
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_portals" FROM app_runtime;

CREATE TABLE "sd_portal_desks" (
    "organization_id" UUID NOT NULL,
    "portal_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,

    CONSTRAINT "sd_portal_desks_pkey" PRIMARY KEY ("portal_id", "desk_id"),
    CONSTRAINT "sd_portal_desks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_portal_desks_portal_fkey" FOREIGN KEY ("organization_id", "portal_id") REFERENCES "sd_portals"("organization_id", "id"),
    CONSTRAINT "sd_portal_desks_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id")
);

-- External requesters' sign-ins (P02 §4.7 external login, YX-SEC-21): not a users row and not a seat; a random token
-- kept only as its sha256, 8 hours at most and 2 hours idle, ended at sign-out or when the contact is turned off.
CREATE TABLE "sd_portal_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "portal_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_portal_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_portal_sessions_token_key" UNIQUE ("organization_id", "token_hash"),
    CONSTRAINT "sd_portal_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_portal_sessions_portal_fkey" FOREIGN KEY ("organization_id", "portal_id") REFERENCES "sd_portals"("organization_id", "id"),
    CONSTRAINT "sd_portal_sessions_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_portal_sessions" FROM app_runtime;

-- Open-portal requests waiting for their email link (US-G-021). Kept 24 hours; the token is only a sha256 here.
CREATE TABLE "sd_portal_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "portal_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "ip" VARCHAR(45),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "ticket_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_portal_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_portal_requests_token_key" UNIQUE ("organization_id", "token_hash"),
    CONSTRAINT "sd_portal_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_portal_requests_portal_fkey" FOREIGN KEY ("organization_id", "portal_id") REFERENCES "sd_portals"("organization_id", "id"),
    CONSTRAINT "sd_portal_requests_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id")
);

-- ---------------------------------------------------------------------------------------------
-- SD-1.23 known-issue banners (US-G-020). A banner linked to an incident ends when that incident is solved.
CREATE TABLE "sd_banners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "audience" VARCHAR(10) NOT NULL DEFAULT 'everyone',
    "location_id" UUID,
    "text" VARCHAR(300) NOT NULL,
    "severity" VARCHAR(8) NOT NULL DEFAULT 'warning',
    "ticket_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_banners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_banners_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_banners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_banners_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_banners_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_banners_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "sd_banners_audience_check" CHECK ("audience" IN ('everyone', 'employees', 'customers')),
    CONSTRAINT "sd_banners_text_check" CHECK (char_length(btrim("text")) BETWEEN 1 AND 300),
    CONSTRAINT "sd_banners_severity_check" CHECK ("severity" IN ('info', 'warning', 'outage')),
    CONSTRAINT "sd_banners_dates_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_banners" FROM app_runtime;

CREATE TABLE "sd_banner_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "banner_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_banner_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_banner_votes_key" UNIQUE ("organization_id", "banner_id", "person_id"),
    CONSTRAINT "sd_banner_votes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_banner_votes_banner_fkey" FOREIGN KEY ("organization_id", "banner_id") REFERENCES "sd_banners"("organization_id", "id"),
    CONSTRAINT "sd_banner_votes_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_banner_votes" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14, §5.1).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_customer_accounts', 'sd_customer_contacts', 'sd_entitlements', 'sd_products', 'sd_agent_account_scope',
    'sd_sending_domains', 'sd_mailboxes', 'sd_inbound_emails', 'sd_email_rules', 'sd_email_suppressions', 'sd_portals',
    'sd_portal_desks', 'sd_portal_sessions', 'sd_portal_requests', 'sd_banners', 'sd_banner_votes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- External requesters in SQL (§14.1: "checked in SQL and in the service"). The portal sets app.portal_person_id in its
-- own transaction (never with a user id). Such a session sees only tickets it raised, is the subject of, follows, or
-- shares through its account as a customer admin contact; of those, only replies, system messages, files sent to it or
-- by it and the timeline entries meant for requesters.
CREATE FUNCTION app_portal_person() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.portal_person_id', true), '')::uuid
$$;

CREATE FUNCTION sd_portal_ticket_ok(p_org uuid, p_ticket uuid, p_requester uuid, p_for uuid, p_account uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_portal_person() IS NULL
    OR p_requester = app_portal_person()
    OR p_for = app_portal_person()
    OR EXISTS (SELECT 1 FROM sd_ticket_watchers w WHERE w.organization_id = p_org AND w.ticket_id = p_ticket AND w.person_id = app_portal_person())
    OR (p_account IS NOT NULL AND EXISTS (
         SELECT 1 FROM sd_customer_contacts c
         WHERE c.organization_id = p_org AND c.account_id = p_account AND c.person_id = app_portal_person()
           AND c.sees_account_tickets AND c.status = 'active'))
$$;

CREATE POLICY sd_portal_scope ON "sd_tickets" AS RESTRICTIVE
  USING (sd_portal_ticket_ok(organization_id, id, requester_person_id, requested_for_person_id, customer_account_id));
CREATE POLICY sd_portal_scope ON "sd_ticket_messages" AS RESTRICTIVE FOR SELECT
  USING (app_portal_person() IS NULL OR (kind IN ('reply', 'system') AND EXISTS (SELECT 1 FROM sd_tickets t WHERE t.organization_id = sd_ticket_messages.organization_id AND t.id = ticket_id)));
CREATE POLICY sd_portal_scope ON "sd_attachments" AS RESTRICTIVE FOR SELECT
  USING (app_portal_person() IS NULL OR ((side = 'requester' OR EXISTS (SELECT 1 FROM sd_ticket_messages m WHERE m.organization_id = sd_attachments.organization_id AND m.id = message_id AND m.kind = 'reply'))
         AND EXISTS (SELECT 1 FROM sd_tickets t WHERE t.organization_id = sd_attachments.organization_id AND t.id = ticket_id)));
CREATE POLICY sd_portal_scope ON "sd_ticket_events" AS RESTRICTIVE FOR SELECT
  USING (app_portal_person() IS NULL OR (requester_visible AND EXISTS (SELECT 1 FROM sd_tickets t WHERE t.organization_id = sd_ticket_events.organization_id AND t.id = ticket_id)));
-- Nothing internal is ever read through a portal session.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_side_conversations', 'sd_sensitive_values', 'sd_ticket_reads', 'sd_ticket_collaborators',
    'sd_time_entries', 'sd_inbound_emails', 'sd_mailboxes', 'sd_email_rules', 'sd_sending_domains', 'sd_agent_account_scope']
  LOOP
    EXECUTE format('CREATE POLICY sd_portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;

-- §5.7 visibility for a sensitive or private record also lets its own external requester in (through the portal).
CREATE OR REPLACE FUNCTION sd_ticket_visible(p_org uuid, p_desk uuid, p_ticket uuid, p_sensitive boolean, p_private boolean, p_requester uuid, p_for uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT sd_system()
    OR (NOT p_sensitive AND NOT p_private AND NOT EXISTS (SELECT 1 FROM sd_desks d WHERE d.organization_id = p_org AND d.id = p_desk AND d.privacy = 'restricted'))
    OR (app_portal_person() IS NOT NULL AND (p_requester = app_portal_person() OR p_for = app_portal_person()))
    OR (app_current_user_id() IS NOT NULL AND (
         p_requester = ANY (app_current_person_ids())
      OR (p_for IS NOT NULL AND p_for = ANY (app_current_person_ids()))
      OR sd_agent_seat_held(p_org, p_desk, app_current_user_id())
      OR EXISTS (
           SELECT 1 FROM sd_ticket_collaborators c JOIN sd_desk_members m
             ON m.organization_id = c.organization_id AND m.desk_id = c.desk_id AND m.user_id = c.user_id
           WHERE c.organization_id = p_org AND c.ticket_id = p_ticket AND c.user_id = app_current_user_id()
             AND m.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
             AND (m.valid_to IS NULL OR m.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date))))
$$;

-- ---------------------------------------------------------------------------------------------
-- §6.2 keys (desk.portal.manage, desk.mailbox.manage, desk.customer.manage are already in the 3b-1 list). The System
-- Admin also sets up mailboxes, portals and customers.
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('desk.mailbox.manage', 'desk.portal.manage', 'desk.customer.manage')
ON CONFLICT DO NOTHING;
