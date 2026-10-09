-- Service Desk phase 3b-2 (ESM), batch 2 (M14-BUILD-DESIGN §5.3, §9.4; slices SD-2.06 … SD-2.11, SD-2.13, SD-2.17 … SD-2.19):
--   SD-2.06 approve from Teams / Slack cards and push: who linked which chat app or phone, and signed single-use action
--           tokens (the token row is what makes a link single use);
--   SD-2.07 documents made from desk templates inside a request, signed in the app with evidence (P05 seam);
--   SD-2.08 joiner and leaver journeys (catalogue items started from M01 events), one run per person and date;
--   SD-2.09 categories that make a ticket private by default (M08);
--   SD-2.10 shares with another desk, forwarding pairs, branches (site set-up);
--   SD-2.11 lifecycles per ticket type: immutable versions, tickets pin the version they started with;
--   SD-2.13 recurring records (RFC 5545 rules) and their runs; timed message sequences and their runs;
--   SD-2.17 interactions (chat, call, walk-up);
--   SD-2.18 / SD-2.19 live chat: queues (pre-chat form, proactive prompts), sessions ("Seen" markers, D11), messages
--           (cards), files (same scan pipeline), ratings.
-- Every new table: organization_id NOT NULL + forced RLS with the standard tenant_isolation policy, composite keys,
-- nothing readable through an outside portal session, and the §5.7 visibility layer where a row belongs to a ticket.

-- ---------------------------------------------------------------------------------------------
-- Channels a ticket can come in by (SD-2.17 calls and walk-ups, SD-2.18 chat).
ALTER TABLE "sd_tickets" DROP CONSTRAINT "sd_tickets_channel_check",
  ADD CONSTRAINT "sd_tickets_channel_check" CHECK ("channel" IN ('portal', 'agent', 'api', 'email', 'chat', 'phone', 'walk_up'));
ALTER TABLE "sd_ticket_messages" DROP CONSTRAINT "sd_ticket_messages_channel_check",
  ADD CONSTRAINT "sd_ticket_messages_channel_check" CHECK ("channel" IN ('portal', 'agent', 'api', 'email', 'system', 'chat', 'phone', 'walk_up'));

-- ---------------------------------------------------------------------------------------------
-- SD-2.06 (US-G-043, US-E-282): a person links Teams, Slack or a phone (push) to their own login. Cards and pushes go
-- only to linked people; the provider id is never trusted on its own (the action token is bound to the login).
CREATE TABLE "channel_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(8) NOT NULL,
    "external_ref" VARCHAR(200) NOT NULL,
    "label" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channel_links_ref_key" UNIQUE ("organization_id", "provider", "external_ref"),
    CONSTRAINT "channel_links_user_key" UNIQUE ("organization_id", "user_id", "provider"),
    CONSTRAINT "channel_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "channel_links_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "channel_links_provider_check" CHECK ("provider" IN ('teams', 'slack', 'push'))
);

CREATE UNIQUE INDEX "wf_tasks_org_id_key" ON "wf_tasks"("organization_id", "id");

-- One signed link per approval task and channel. The token carries this row's id and is refused once used_at is set,
-- after expires_at, or when the task is no longer open and still the same person's.
CREATE TABLE "wf_action_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" VARCHAR(8) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wf_action_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wf_action_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wf_action_tokens_task_fkey" FOREIGN KEY ("organization_id", "task_id") REFERENCES "wf_tasks"("organization_id", "id"),
    CONSTRAINT "wf_action_tokens_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "wf_action_tokens_channel_check" CHECK ("channel" IN ('teams', 'slack', 'push', 'email'))
);
CREATE INDEX "wf_action_tokens_task_idx" ON "wf_action_tokens"("organization_id", "task_id");
REVOKE DELETE, TRUNCATE ON TABLE "wf_action_tokens" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-2.07 (US-G-045, P05 seam): document templates of a desk (plain text with {{fields}}), and documents made inside a
-- request. A document is immutable once made (its hash is stored); signing stores the evidence and a sealed copy.
CREATE TABLE "sd_doc_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "body" TEXT NOT NULL,
    "needs_signature" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_doc_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_doc_templates_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_doc_templates_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_doc_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_doc_templates_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_doc_templates_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_doc_templates_body_check" CHECK (char_length("body") BETWEEN 1 AND 20000)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_doc_templates" FROM app_runtime;

CREATE TABLE "sd_request_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body_text" TEXT NOT NULL,
    "blob_key" VARCHAR(500) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "signer_person_id" UUID,
    -- 'in_app' today; an outside e-sign provider is an adapter (go-live).
    "provider" VARCHAR(12) NOT NULL DEFAULT 'in_app',
    "status" VARCHAR(10) NOT NULL,
    "evidence" JSONB,
    "signed_blob_key" VARCHAR(500),
    "signed_sha256" CHAR(64),
    "signed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_request_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_request_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_request_documents_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_request_documents_template_fkey" FOREIGN KEY ("organization_id", "desk_id", "template_id") REFERENCES "sd_doc_templates"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_request_documents_signer_fkey" FOREIGN KEY ("organization_id", "signer_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_request_documents_status_check" CHECK ("status" IN ('issued', 'pending', 'signed', 'declined', 'withdrawn')),
    CONSTRAINT "sd_request_documents_signer_check" CHECK ("status" = 'issued' OR "signer_person_id" IS NOT NULL),
    CONSTRAINT "sd_request_documents_signed_check" CHECK ("status" <> 'signed' OR ("signed_at" IS NOT NULL AND "signed_sha256" IS NOT NULL AND "evidence" IS NOT NULL))
);
CREATE INDEX "sd_request_documents_ticket_idx" ON "sd_request_documents"("organization_id", "ticket_id");
REVOKE DELETE, TRUNCATE ON TABLE "sd_request_documents" FROM app_runtime;

-- The document text, file and hash never change after it is made (a correction is a new document); a finished one
-- keeps its state. The sensitive / private copies may follow the ticket.
CREATE FUNCTION sd_request_documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.ticket_id, NEW.template_id, NEW.template_version, NEW.title, NEW.body_text, NEW.blob_key, NEW.sha256, NEW.signer_person_id, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.ticket_id, OLD.template_id, OLD.template_version, OLD.title, OLD.body_text, OLD.blob_key, OLD.sha256, OLD.signer_person_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a document never changes after it is made' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('signed', 'declined', 'withdrawn', 'issued') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'a finished document keeps its state' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER sd_request_documents_guard BEFORE UPDATE ON "sd_request_documents" FOR EACH ROW EXECUTE FUNCTION sd_request_documents_guard();

-- ---------------------------------------------------------------------------------------------
-- SD-2.08 (US-B-127, US-G-049): what a joiner or a leaver gets, as catalogue items (bundles with their own teams and
-- OLAs). Items only meant for journeys stay out of the catalogue.
ALTER TABLE "sd_catalog_items" ADD COLUMN "journey_only" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "sd_journeys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(6) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "item_ids" UUID[] NOT NULL DEFAULT '{}',
    -- P19 condition over the person's profile (department, location, legal entity, cost centre); NULL = everyone.
    "audience" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_journeys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_journeys_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_journeys_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "sd_journeys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_journeys_kind_check" CHECK ("kind" IN ('join', 'exit')),
    CONSTRAINT "sd_journeys_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_journeys_items_check" CHECK (cardinality("item_ids") BETWEEN 1 AND 20)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_journeys" FROM app_runtime;

CREATE TABLE "sd_journey_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "journey_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "event_date" DATE NOT NULL,
    "ticket_ids" UUID[] NOT NULL DEFAULT '{}',
    "started_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_journey_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_journey_runs_once_key" UNIQUE ("organization_id", "journey_id", "employee_id", "event_date"),
    CONSTRAINT "sd_journey_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_journey_runs_journey_fkey" FOREIGN KEY ("organization_id", "journey_id") REFERENCES "sd_journeys"("organization_id", "id"),
    CONSTRAINT "sd_journey_runs_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_journey_runs" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-2.09 (M08 YX-HD-03): a category can make every new ticket in it private (the requester and the desk's agents only).
ALTER TABLE "sd_categories" ADD COLUMN "private_by_default" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------------------------
-- SD-2.10 (US-G-046, US-G-050): shares with another desk; which desks a desk may forward to; branches (a site's own
-- team, hours and admin).
CREATE TABLE "sd_ticket_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "shared_desk_id" UUID NOT NULL,
    "level" VARCHAR(8) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ticket_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_ticket_shares_key" UNIQUE ("organization_id", "ticket_id", "shared_desk_id"),
    CONSTRAINT "sd_ticket_shares_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ticket_shares_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_ticket_shares_desk_fkey" FOREIGN KEY ("organization_id", "shared_desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_ticket_shares_level_check" CHECK ("level" IN ('view', 'comment')),
    CONSTRAINT "sd_ticket_shares_other_check" CHECK ("shared_desk_id" <> "desk_id")
);

ALTER TABLE "sd_desks" ADD COLUMN "forward_to" UUID[] NOT NULL DEFAULT '{}';

CREATE TABLE "sd_desk_branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "group_id" UUID,
    "calendar_id" UUID,
    "admin_user_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_desk_branches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_desk_branches_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_desk_branches_location_key" UNIQUE ("organization_id", "desk_id", "location_id"),
    CONSTRAINT "sd_desk_branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_desk_branches_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_desk_branches_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "sd_desk_branches_group_fkey" FOREIGN KEY ("organization_id", "desk_id", "group_id") REFERENCES "sd_groups"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_desk_branches_calendar_fkey" FOREIGN KEY ("organization_id", "calendar_id") REFERENCES "business_calendars"("organization_id", "id"),
    CONSTRAINT "sd_desk_branches_admin_fkey" FOREIGN KEY ("organization_id", "admin_user_id") REFERENCES "users"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_desk_branches" FROM app_runtime;
ALTER TABLE "sd_tickets" ADD COLUMN "branch_id" UUID;

-- ---------------------------------------------------------------------------------------------
-- SD-2.11 (US-G-062): one lifecycle per ticket type of a desk. Published versions never change; a ticket keeps the
-- version it started with.
CREATE TABLE "sd_lifecycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "current_version" INTEGER,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "state" VARCHAR(8) NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_lifecycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_lifecycles_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_lifecycles_type_key" UNIQUE ("organization_id", "desk_id", "ticket_type_id"),
    CONSTRAINT "sd_lifecycles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_lifecycles_type_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_type_id") REFERENCES "sd_ticket_types"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_lifecycles_state_check" CHECK ("state" IN ('draft', 'active', 'retired')),
    CONSTRAINT "sd_lifecycles_active_check" CHECK ("state" <> 'active' OR "current_version" IS NOT NULL)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_lifecycles" FROM app_runtime;

CREATE TABLE "sd_lifecycle_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "lifecycle_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "start_status_id" UUID NOT NULL,
    "status_ids" UUID[] NOT NULL,
    -- [{ from, to, require: [field…], who: 'agent' | 'lead', when?: P19 group over the ticket }]
    "transitions" JSONB NOT NULL,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_lifecycle_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_lifecycle_versions_key" UNIQUE ("organization_id", "lifecycle_id", "version"),
    CONSTRAINT "sd_lifecycle_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_lifecycle_versions_lifecycle_fkey" FOREIGN KEY ("organization_id", "desk_id", "lifecycle_id") REFERENCES "sd_lifecycles"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_lifecycle_versions_start_fkey" FOREIGN KEY ("organization_id", "desk_id", "start_status_id") REFERENCES "sd_statuses"("organization_id", "desk_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_lifecycle_versions" FROM app_runtime;
ALTER TABLE "sd_tickets" ADD COLUMN "lifecycle_id" UUID, ADD COLUMN "lifecycle_version" INTEGER,
  ADD CONSTRAINT "sd_tickets_lifecycle_check" CHECK (("lifecycle_id" IS NULL) = ("lifecycle_version" IS NULL));

-- ---------------------------------------------------------------------------------------------
-- SD-2.13 (US-G-052, US-G-053): recurring records from an RFC 5545 rule, each due time made once; timed messages.
CREATE TABLE "sd_recurring" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- { subject, bodyHtml, typeId?, categoryId?, groupId?, assigneeUserId?, priority? }
    "template" JSONB NOT NULL,
    "rrule" VARCHAR(500) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "next_run_at" TIMESTAMPTZ(3),
    "last_run_at" TIMESTAMPTZ(3),
    "state" VARCHAR(8) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_recurring_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_recurring_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_recurring_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_recurring_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_recurring_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_recurring_state_check" CHECK ("state" IN ('active', 'paused', 'ended'))
);
CREATE INDEX "sd_recurring_due_idx" ON "sd_recurring"("next_run_at") WHERE "state" = 'active';
REVOKE DELETE, TRUNCATE ON TABLE "sd_recurring" FROM app_runtime;

CREATE TABLE "sd_recurring_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "recurring_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "ticket_id" UUID,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "missed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_recurring_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_recurring_runs_once_key" UNIQUE ("organization_id", "recurring_id", "due_at"),
    CONSTRAINT "sd_recurring_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_recurring_runs_recurring_fkey" FOREIGN KEY ("organization_id", "desk_id", "recurring_id") REFERENCES "sd_recurring"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_recurring_runs_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_recurring_runs" FROM app_runtime;

CREATE TABLE "sd_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- [{ afterHours, bodyHtml }]
    "steps" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sequences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sequences_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sequences_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sequences_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_sequences" FROM app_runtime;

CREATE TABLE "sd_sequence_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "sequence_id" UUID NOT NULL,
    "sequence_version" INTEGER NOT NULL,
    "started_by" UUID NOT NULL,
    "step" SMALLINT NOT NULL DEFAULT 0,
    "next_at" TIMESTAMPTZ(3),
    "state" VARCHAR(8) NOT NULL DEFAULT 'running',
    "stop_reason" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sequence_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sequence_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sequence_runs_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sequence_runs_sequence_fkey" FOREIGN KEY ("organization_id", "desk_id", "sequence_id") REFERENCES "sd_sequences"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sequence_runs_state_check" CHECK ("state" IN ('running', 'stopped', 'done'))
);
CREATE UNIQUE INDEX "sd_sequence_runs_running_key" ON "sd_sequence_runs"("organization_id", "ticket_id", "sequence_id") WHERE "state" = 'running';
CREATE INDEX "sd_sequence_runs_due_idx" ON "sd_sequence_runs"("next_at") WHERE "state" = 'running';
REVOKE DELETE, TRUNCATE ON TABLE "sd_sequence_runs" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-2.17 (US-B-135, US-G-056): a light record per contact. Notes are masked before they are stored (YX-SD-15).
CREATE TABLE "sd_interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "channel" VARCHAR(8) NOT NULL,
    "person_id" UUID,
    "agent_user_id" UUID NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "outcome" VARCHAR(10) NOT NULL DEFAULT 'open',
    "ticket_id" UUID,
    "chat_session_id" UUID,
    -- The telephony system's call id when click-to-call arrives (3b-4).
    "call_ref" VARCHAR(100),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_interactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_interactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_interactions_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_interactions_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_interactions_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_interactions_channel_check" CHECK ("channel" IN ('chat', 'call', 'walk_up')),
    CONSTRAINT "sd_interactions_outcome_check" CHECK ("outcome" IN ('open', 'resolved', 'ticket', 'abandoned')),
    CONSTRAINT "sd_interactions_ticket_check" CHECK (("outcome" = 'ticket') = ("ticket_id" IS NOT NULL)),
    CONSTRAINT "sd_interactions_notes_check" CHECK (char_length("notes") <= 4000)
);
CREATE INDEX "sd_interactions_desk_idx" ON "sd_interactions"("organization_id", "desk_id", "started_at" DESC);
REVOKE DELETE, TRUNCATE ON TABLE "sd_interactions" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-2.18 / SD-2.19 (US-B-132, US-G-059): live chat on our own socket.io server (D1). "Seen" markers in chat only
-- (D11): when each side last looked, never anything about email.
CREATE TABLE "sd_chat_queues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "group_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "max_per_agent" SMALLINT NOT NULL DEFAULT 3,
    "wait_minutes" SMALLINT NOT NULL DEFAULT 10,
    "welcome" VARCHAR(300),
    -- A P18 form the requester fills before the chat starts.
    "pre_chat" JSONB NOT NULL DEFAULT '{"sections":[],"rules":[]}',
    -- [{ id, pathPrefix, text, afterSeconds }]
    "prompts" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_chat_queues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_chat_queues_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_queues_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_chat_queues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_chat_queues_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_chat_queues_group_fkey" FOREIGN KEY ("organization_id", "desk_id", "group_id") REFERENCES "sd_groups"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_queues_max_check" CHECK ("max_per_agent" BETWEEN 1 AND 10),
    CONSTRAINT "sd_chat_queues_wait_check" CHECK ("wait_minutes" BETWEEN 1 AND 120)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_chat_queues" FROM app_runtime;

CREATE TABLE "sd_chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "channel" VARCHAR(8) NOT NULL DEFAULT 'web',
    "requester_user_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "agent_user_id" UUID,
    "state" VARCHAR(8) NOT NULL DEFAULT 'queued',
    "subject" VARCHAR(200) NOT NULL,
    "pre_chat" JSONB NOT NULL DEFAULT '{}',
    "ticket_id" UUID,
    "rating" SMALLINT,
    "rating_comment" VARCHAR(500),
    "end_reason" VARCHAR(12),
    "requester_seen_at" TIMESTAMPTZ(3),
    "agent_seen_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_chat_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_chat_sessions_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_chat_sessions_queue_fkey" FOREIGN KEY ("organization_id", "desk_id", "queue_id") REFERENCES "sd_chat_queues"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_sessions_requester_fkey" FOREIGN KEY ("organization_id", "requester_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_chat_sessions_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_chat_sessions_agent_fkey" FOREIGN KEY ("organization_id", "agent_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_chat_sessions_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_sessions_state_check" CHECK ("state" IN ('queued', 'active', 'ended')),
    CONSTRAINT "sd_chat_sessions_agent_check" CHECK ("state" <> 'active' OR "agent_user_id" IS NOT NULL),
    CONSTRAINT "sd_chat_sessions_rating_check" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5 AND "state" = 'ended')),
    CONSTRAINT "sd_chat_sessions_channel_check" CHECK ("channel" IN ('web'))
);
CREATE INDEX "sd_chat_sessions_desk_idx" ON "sd_chat_sessions"("organization_id", "desk_id", "state");
CREATE INDEX "sd_chat_sessions_requester_idx" ON "sd_chat_sessions"("organization_id", "requester_user_id", "state");
REVOKE DELETE, TRUNCATE ON TABLE "sd_chat_sessions" FROM app_runtime;

CREATE TABLE "sd_chat_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "blob_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "scan_status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "scan_detail" VARCHAR(200),
    "scanned_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_chat_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_chat_files_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_chat_files_session_fkey" FOREIGN KEY ("organization_id", "desk_id", "session_id") REFERENCES "sd_chat_sessions"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_files_scan_check" CHECK ("scan_status" IN ('pending', 'clean', 'infected', 'error'))
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_chat_files" FROM app_runtime;

CREATE TABLE "sd_chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "author" VARCHAR(10) NOT NULL,
    "author_user_id" UUID,
    "body" VARCHAR(2000) NOT NULL DEFAULT '',
    -- { title?, text?, buttons?: [{ label, reply }] } (agent cards; checked on the server)
    "card" JSONB,
    "file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_chat_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_chat_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_chat_messages_session_fkey" FOREIGN KEY ("organization_id", "desk_id", "session_id") REFERENCES "sd_chat_sessions"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_messages_file_fkey" FOREIGN KEY ("organization_id", "desk_id", "file_id") REFERENCES "sd_chat_files"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_chat_messages_author_check" CHECK ("author" IN ('requester', 'agent', 'system'))
);
CREATE INDEX "sd_chat_messages_session_idx" ON "sd_chat_messages"("organization_id", "session_id", "created_at");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_chat_messages" FROM app_runtime;

ALTER TABLE "sd_interactions" ADD CONSTRAINT "sd_interactions_chat_fkey" FOREIGN KEY ("organization_id", "desk_id", "chat_session_id") REFERENCES "sd_chat_sessions"("organization_id", "desk_id", "id");

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14, §5.1) on every new table; nothing of this is read through an outside portal session.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['channel_links', 'wf_action_tokens', 'sd_doc_templates', 'sd_request_documents', 'sd_journeys',
    'sd_journey_runs', 'sd_ticket_shares', 'sd_desk_branches', 'sd_lifecycles', 'sd_lifecycle_versions', 'sd_recurring',
    'sd_recurring_runs', 'sd_sequences', 'sd_sequence_runs', 'sd_interactions', 'sd_chat_queues', 'sd_chat_sessions',
    'sd_chat_files', 'sd_chat_messages']
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

-- ---------------------------------------------------------------------------------------------
-- §5.7 visibility. Documents and sequence runs belong to a ticket: they carry its sensitive / private flags (copied on
-- insert, kept in step) and are seen exactly when the ticket is.
CREATE TRIGGER sd_request_documents_copy BEFORE INSERT ON "sd_request_documents" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy();
CREATE TRIGGER sd_sequence_runs_copy BEFORE INSERT ON "sd_sequence_runs" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy();
CREATE OR REPLACE FUNCTION sd_tickets_sync_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sensitive IS DISTINCT FROM OLD.sensitive OR NEW.private IS DISTINCT FROM OLD.private THEN
    UPDATE sd_ticket_messages SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_attachments SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_ticket_events SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_request_documents SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_sequence_runs SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE POLICY sd_visibility ON "sd_request_documents" AS RESTRICTIVE USING (sd_ticket_child_visible(organization_id, desk_id, ticket_id, sensitive, private));
CREATE POLICY sd_visibility ON "sd_sequence_runs" AS RESTRICTIVE USING (sd_ticket_child_visible(organization_id, desk_id, ticket_id, sensitive, private));
-- A share shows only while its ticket does.
CREATE POLICY sd_visibility ON "sd_ticket_shares" AS RESTRICTIVE
  USING (sd_system() OR EXISTS (SELECT 1 FROM sd_tickets t WHERE t.organization_id = sd_ticket_shares.organization_id AND t.id = sd_ticket_shares.ticket_id));

-- Interactions: only the desk's agents today (and the desk's own jobs).
CREATE POLICY sd_visibility ON "sd_interactions" AS RESTRICTIVE
  USING (sd_system() OR sd_agent_seat_held(organization_id, desk_id, app_current_user_id()));

-- A chat is seen by the person who started it and by the desk's agents today; never by role alone, never across
-- companies (tenant_isolation), never by YukthiX staff.
CREATE POLICY sd_visibility ON "sd_chat_sessions" AS RESTRICTIVE
  USING (sd_system() OR (app_current_user_id() IS NOT NULL AND (requester_user_id = app_current_user_id() OR sd_agent_seat_held(organization_id, desk_id, app_current_user_id()))));
CREATE FUNCTION sd_chat_visible(p_org uuid, p_session uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT sd_system() OR EXISTS (SELECT 1 FROM sd_chat_sessions s WHERE s.organization_id = p_org AND s.id = p_session)
$$;
CREATE POLICY sd_visibility ON "sd_chat_messages" AS RESTRICTIVE USING (sd_chat_visible(organization_id, session_id));
CREATE POLICY sd_visibility ON "sd_chat_files" AS RESTRICTIVE USING (sd_chat_visible(organization_id, session_id));

-- A channel link is its owner's (the engine's own step reads them to send cards).
CREATE POLICY wf_owner_only ON "channel_links" AS RESTRICTIVE
  USING (sd_system() OR user_id = app_current_user_id());

-- §5.7 with shares (US-G-046): agents of a desk the ticket is shared with see it (view or comment), never by role alone.
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
             AND (m.valid_to IS NULL OR m.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date))
      OR EXISTS (
           SELECT 1 FROM sd_ticket_shares s
           WHERE s.organization_id = p_org AND s.ticket_id = p_ticket AND sd_agent_seat_held(p_org, s.shared_desk_id, app_current_user_id()))))
$$;

-- ---------------------------------------------------------------------------------------------
-- Permission keys (§6.2, 3b-2). Approvers need no key (P03); requesters chat and sign through their implicit role.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'desk.lifecycle.manage', 'Design ticket lifecycles: statuses, allowed moves and what each move needs'),
  (gen_random_uuid(), 'desk.channel.manage', 'Set up live chat queues, pre-chat forms and chat prompts'),
  (gen_random_uuid(), 'desk.chat.work', 'Take live chats from the desk queue'),
  (gen_random_uuid(), 'desk.hr_summary.view', 'See the employee summary beside a ticket (only the fields your HR access allows)'),
  (gen_random_uuid(), 'desk.ticket.move', 'Move a ticket to another desk or share it with one')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('desk.lifecycle.manage', 'desk.channel.manage')
ON CONFLICT DO NOTHING;
