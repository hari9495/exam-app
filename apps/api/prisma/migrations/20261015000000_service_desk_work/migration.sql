-- Service Desk phase 3b-1, batch 2, part 1 (M14-BUILD-DESIGN §5.2, §5.7, §6.3, slices SD-1.09 … SD-1.13):
-- merge / link / parent-child / split / side conversations; tasks, checklists, templates, resolution codes, tier
-- escalation, reopen and auto-close rules; reminders, snooze and the personal iCal feed; the restrictive visibility
-- policy for sensitive / private records and restricted desks, PII masking and the read log; the P14 meter ledger.
--
-- Every new table: organization_id NOT NULL + forced RLS with the standard tenant_isolation policy, composite keys.

-- ---------------------------------------------------------------------------------------------
-- Desk rules (YX-SD-10, YX-SD-11, US-G-008). Starter values follow M08 YX-HD-05: reopen within 7 days, close 3 days
-- after resolving.
ALTER TABLE "sd_desks"
    ADD COLUMN "resolution_required" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "reopen_window_days" SMALLINT NOT NULL DEFAULT 7,
    ADD COLUMN "requester_can_reopen" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "auto_close_days" SMALLINT DEFAULT 3,
    ADD CONSTRAINT "sd_desks_reopen_check" CHECK ("reopen_window_days" BETWEEN 0 AND 90),
    ADD CONSTRAINT "sd_desks_autoclose_check" CHECK ("auto_close_days" IS NULL OR "auto_close_days" BETWEEN 1 AND 90);

-- Founder decision 8 Oct 2026: on a half-day holiday each calendar chooses which half of the working day stays open.
ALTER TABLE "business_calendars"
    ADD COLUMN "half_day_open_half" VARCHAR(6) NOT NULL DEFAULT 'first',
    ADD CONSTRAINT "business_calendars_half_check" CHECK ("half_day_open_half" IN ('first', 'second'));

-- ---------------------------------------------------------------------------------------------
-- SD-1.09 / SD-1.10 ticket columns: parent (one level: a child never has children), merge target, tracker flag
-- (US-G-220), support level (YX-SD-12) and the level that solved it (US-G-007 reports).
ALTER TABLE "sd_tickets"
    ADD COLUMN "parent_id" UUID,
    ADD COLUMN "merged_into_id" UUID,
    ADD COLUMN "tracker" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "tier" VARCHAR(2) NOT NULL DEFAULT 'L1',
    ADD COLUMN "resolved_tier" VARCHAR(2),
    ADD CONSTRAINT "sd_tickets_parent_fkey" FOREIGN KEY ("organization_id", "parent_id") REFERENCES "sd_tickets"("organization_id", "id"),
    ADD CONSTRAINT "sd_tickets_merged_fkey" FOREIGN KEY ("organization_id", "merged_into_id") REFERENCES "sd_tickets"("organization_id", "id"),
    ADD CONSTRAINT "sd_tickets_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
    ADD CONSTRAINT "sd_tickets_merged_check" CHECK ("merged_into_id" IS NULL OR "merged_into_id" <> "id"),
    ADD CONSTRAINT "sd_tickets_tier_check" CHECK ("tier" IN ('L1', 'L2', 'L3') AND ("resolved_tier" IS NULL OR "resolved_tier" IN ('L1', 'L2', 'L3')));
CREATE INDEX "sd_tickets_parent_idx" ON "sd_tickets"("organization_id", "parent_id") WHERE "parent_id" IS NOT NULL;
CREATE INDEX "sd_tickets_merged_idx" ON "sd_tickets"("organization_id", "merged_into_id") WHERE "merged_into_id" IS NOT NULL;
CREATE INDEX "sd_tickets_autoclose_idx" ON "sd_tickets"("resolved_at") WHERE "system_state" = 'solved';

-- One level of parent and child, and a merged ticket is never merged again or merged into a merged one.
CREATE FUNCTION sd_tickets_family_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    IF EXISTS (SELECT 1 FROM sd_tickets p WHERE p.organization_id = NEW.organization_id AND p.id = NEW.parent_id AND p.parent_id IS NOT NULL)
       OR EXISTS (SELECT 1 FROM sd_tickets c WHERE c.organization_id = NEW.organization_id AND c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'a child ticket cannot have children of its own' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD.merged_into_id IS NOT NULL AND NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id THEN
    RAISE EXCEPTION 'a merged ticket stays merged' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_tickets_family_guard BEFORE UPDATE OF "parent_id", "merged_into_id" ON "sd_tickets" FOR EACH ROW EXECUTE FUNCTION sd_tickets_family_guard();

-- ---------------------------------------------------------------------------------------------
-- SD-1.09 links between tickets. Merge = 'duplicate' + merged_into (YX-SD-08); 'tracked_by' points a customer ticket
-- at its tracker (US-G-220); 'follow_up' points a follow-up at the closed ticket it continues (US-G-008).
CREATE TABLE "sd_ticket_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "from_ticket_id" UUID NOT NULL,
    "to_ticket_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ticket_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_ticket_links_key" UNIQUE ("organization_id", "from_ticket_id", "to_ticket_id", "kind"),
    CONSTRAINT "sd_ticket_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ticket_links_from_fkey" FOREIGN KEY ("organization_id", "from_ticket_id") REFERENCES "sd_tickets"("organization_id", "id"),
    CONSTRAINT "sd_ticket_links_to_fkey" FOREIGN KEY ("organization_id", "to_ticket_id") REFERENCES "sd_tickets"("organization_id", "id"),
    CONSTRAINT "sd_ticket_links_kind_check" CHECK ("kind" IN ('related', 'duplicate', 'blocks', 'caused_by', 'tracked_by', 'follow_up')),
    CONSTRAINT "sd_ticket_links_self_check" CHECK ("from_ticket_id" <> "to_ticket_id")
);
CREATE INDEX "sd_ticket_links_to_idx" ON "sd_ticket_links"("organization_id", "to_ticket_id");

-- US-G-005 side conversations: never visible to the requester (YX-SD-13). 'note_thread' keeps an internal thread on
-- the ticket; 'child_ticket' raises a ticket for another team. Email and Teams threads join with the email slices
-- (SD-1.19), as new channel values on this same table.
CREATE TABLE "sd_side_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "channel" VARCHAR(12) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "with_whom" VARCHAR(200),
    "child_ticket_id" UUID,
    "state" VARCHAR(6) NOT NULL DEFAULT 'open',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_side_conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_side_conversations_ticket_id_key" UNIQUE ("organization_id", "ticket_id", "id"),
    CONSTRAINT "sd_side_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_side_conversations_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_side_conversations_child_fkey" FOREIGN KEY ("organization_id", "child_ticket_id") REFERENCES "sd_tickets"("organization_id", "id"),
    CONSTRAINT "sd_side_conversations_user_fkey" FOREIGN KEY ("organization_id", "created_by") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_side_conversations_channel_check" CHECK ("channel" IN ('note_thread', 'child_ticket') AND (("channel" = 'child_ticket') = ("child_ticket_id" IS NOT NULL))),
    CONSTRAINT "sd_side_conversations_subject_check" CHECK (char_length(btrim("subject")) BETWEEN 1 AND 200),
    CONSTRAINT "sd_side_conversations_state_check" CHECK ("state" IN ('open', 'closed'))
);
CREATE INDEX "sd_side_conversations_ticket_idx" ON "sd_side_conversations"("organization_id", "ticket_id");
REVOKE DELETE, TRUNCATE ON TABLE "sd_side_conversations" FROM app_runtime;

-- Messages of a side conversation are kind 'side': agent side only, never shown to the requester, never edited.
ALTER TABLE "sd_ticket_messages"
    ADD COLUMN "side_conversation_id" UUID,
    DROP CONSTRAINT "sd_ticket_messages_kind_check",
    DROP CONSTRAINT "sd_ticket_messages_side_check",
    ADD CONSTRAINT "sd_ticket_messages_kind_check" CHECK ("kind" IN ('reply', 'note', 'system', 'side')),
    ADD CONSTRAINT "sd_ticket_messages_side_check" CHECK ("side" IN ('agent', 'requester', 'system') AND ("kind" NOT IN ('note', 'side') OR "side" = 'agent') AND (("kind" = 'system') = ("side" = 'system'))),
    ADD CONSTRAINT "sd_ticket_messages_thread_check" CHECK (("kind" = 'side') = ("side_conversation_id" IS NOT NULL)),
    ADD CONSTRAINT "sd_ticket_messages_thread_fkey" FOREIGN KEY ("organization_id", "ticket_id", "side_conversation_id") REFERENCES "sd_side_conversations"("organization_id", "ticket_id", "id");

-- ---------------------------------------------------------------------------------------------
-- SD-1.10 tasks and checklist items (US-G-006): on a ticket or standalone on a desk. A collaborator works the tasks
-- given to them; an open task keeps its ticket from being resolved.
CREATE TABLE "sd_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "title" VARCHAR(200) NOT NULL,
    "note" VARCHAR(2000),
    "checklist" BOOLEAN NOT NULL DEFAULT false,
    "assignee_user_id" UUID,
    "group_id" UUID,
    "due_at" TIMESTAMPTZ(3),
    "state" VARCHAR(12) NOT NULL DEFAULT 'open',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMPTZ(3),
    "done_by" UUID,

    CONSTRAINT "sd_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_tasks_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_tasks_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_tasks_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_tasks_group_fkey" FOREIGN KEY ("organization_id", "desk_id", "group_id") REFERENCES "sd_groups"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_tasks_assignee_fkey" FOREIGN KEY ("organization_id", "assignee_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_tasks_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "sd_tasks_state_check" CHECK ("state" IN ('open', 'in_progress', 'done', 'cancelled')),
    CONSTRAINT "sd_tasks_checklist_check" CHECK (NOT "checklist" OR "ticket_id" IS NOT NULL)
);
CREATE INDEX "sd_tasks_ticket_idx" ON "sd_tasks"("organization_id", "ticket_id");
CREATE INDEX "sd_tasks_assignee_idx" ON "sd_tasks"("organization_id", "assignee_user_id", "state");
REVOKE DELETE, TRUNCATE ON TABLE "sd_tasks" FROM app_runtime;

-- A task belongs to someone who holds a seat on its desk today (agent, lead or collaborator), never to an outsider.
CREATE FUNCTION sd_tasks_assignee_seat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assignee_user_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assignee_user_id IS DISTINCT FROM OLD.assignee_user_id)
     AND NOT EXISTS (
       SELECT 1 FROM sd_desk_members m
       WHERE m.organization_id = NEW.organization_id AND m.desk_id = NEW.desk_id AND m.user_id = NEW.assignee_user_id
         AND m.role IN ('agent', 'lead', 'collaborator')
         AND m.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
         AND (m.valid_to IS NULL OR m.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)) THEN
    RAISE EXCEPTION 'DESK_SEAT_REQUIRED: a task goes to someone with a seat on this desk' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.desk_id <> OLD.desk_id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.created_at <> OLD.created_at) THEN
    RAISE EXCEPTION 'a task keeps its desk and ticket' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_tasks_assignee_seat BEFORE INSERT OR UPDATE ON "sd_tasks" FOR EACH ROW EXECUTE FUNCTION sd_tasks_assignee_seat();

-- US-G-001 templates: field defaults and a checklist, per desk and optionally per ticket type.
CREATE TABLE "sd_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_type_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "defaults" JSONB NOT NULL DEFAULT '{}',
    "checklist" TEXT[] NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_templates_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_templates_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_templates_type_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_type_id") REFERENCES "sd_ticket_types"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_templates_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_templates_defaults_check" CHECK (jsonb_typeof("defaults") = 'object'),
    CONSTRAINT "sd_templates_checklist_check" CHECK (cardinality("checklist") <= 30)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_templates" FROM app_runtime;

-- YX-SD-11 resolution codes per desk.
CREATE TABLE "sd_resolution_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_resolution_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_resolution_codes_code_key" UNIQUE ("organization_id", "desk_id", "code"),
    CONSTRAINT "sd_resolution_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_resolution_codes_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_resolution_codes_code_check" CHECK ("code" ~ '^[a-z0-9][a-z0-9_]{0,39}$'),
    CONSTRAINT "sd_resolution_codes_label_check" CHECK (char_length(btrim("label")) BETWEEN 1 AND 100)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_resolution_codes" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-1.11 reminders and snoozes (US-G-009). Personal: only their owner reads them (restrictive policy below).
CREATE TABLE "sd_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "desk_id" UUID,
    "ticket_id" UUID,
    "kind" VARCHAR(8) NOT NULL DEFAULT 'remind',
    "remind_at" TIMESTAMPTZ(3) NOT NULL,
    "note" VARCHAR(300),
    "notified_at" TIMESTAMPTZ(3),
    "done_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_reminders_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_reminders_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_reminders_kind_check" CHECK ("kind" IN ('remind', 'snooze') AND ("kind" = 'remind' OR "ticket_id" IS NOT NULL)),
    CONSTRAINT "sd_reminders_ticket_check" CHECK (("ticket_id" IS NULL) = ("desk_id" IS NULL))
);
CREATE INDEX "sd_reminders_due_idx" ON "sd_reminders"("remind_at") WHERE "notified_at" IS NULL AND "done_at" IS NULL;
CREATE INDEX "sd_reminders_user_idx" ON "sd_reminders"("organization_id", "user_id");
CREATE UNIQUE INDEX "sd_reminders_one_snooze_key" ON "sd_reminders"("organization_id", "user_id", "ticket_id") WHERE "kind" = 'snooze' AND "done_at" IS NULL;

-- The personal iCal feed (US-G-009): a per-user secret, stored only as a keyed hash, revocable at any time.
CREATE TABLE "sd_calendar_feeds" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_calendar_feeds_pkey" PRIMARY KEY ("organization_id", "user_id"),
    CONSTRAINT "sd_calendar_feeds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_calendar_feeds_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_calendar_feeds_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

-- ---------------------------------------------------------------------------------------------
-- SD-1.12 PII found in ticket text (YX-SD-15): the text keeps a masked form; the original is kept here, encrypted
-- with the company secrets key, and shown only with desk.pii.unmask after step-up (each view audited).
CREATE TABLE "sd_sensitive_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message_id" UUID,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "kind" VARCHAR(10) NOT NULL,
    "masked" VARCHAR(40) NOT NULL,
    "value_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sensitive_values_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sensitive_values_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sensitive_values_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sensitive_values_message_fkey" FOREIGN KEY ("organization_id", "ticket_id", "message_id") REFERENCES "sd_ticket_messages"("organization_id", "ticket_id", "id"),
    CONSTRAINT "sd_sensitive_values_kind_check" CHECK ("kind" IN ('aadhaar', 'pan', 'card', 'bank', 'password', 'health'))
);
CREATE INDEX "sd_sensitive_values_ticket_idx" ON "sd_sensitive_values"("organization_id", "ticket_id");
REVOKE DELETE, TRUNCATE ON TABLE "sd_sensitive_values" FROM app_runtime;

-- YX-SD-17 / US-G-030 read log: who opened which ticket, when and from where; one row per viewer and ticket per
-- 30 minutes. Append-only.
CREATE TABLE "sd_ticket_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "user_id" UUID NOT NULL,
    "access" VARCHAR(12) NOT NULL,
    "ip" VARCHAR(45),
    "read_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ticket_reads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_ticket_reads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ticket_reads_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_ticket_reads_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_ticket_reads_access_check" CHECK ("access" IN ('agent', 'observer', 'collaborator', 'export'))
);
CREATE INDEX "sd_ticket_reads_ticket_idx" ON "sd_ticket_reads"("organization_id", "ticket_id", "read_at" DESC);
CREATE INDEX "sd_ticket_reads_user_idx" ON "sd_ticket_reads"("organization_id", "user_id", "ticket_id", "read_at" DESC);
REVOKE DELETE, TRUNCATE ON TABLE "sd_ticket_reads" FROM app_runtime;

-- Masked values and the read log never change; only the privacy copies follow their ticket.
CREATE FUNCTION sd_privacy_copy_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['sensitive', 'private']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['sensitive', 'private']) THEN
    RAISE EXCEPTION 'this record is append-only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_sensitive_values_guard BEFORE UPDATE ON "sd_sensitive_values" FOR EACH ROW EXECUTE FUNCTION sd_privacy_copy_only();
CREATE TRIGGER sd_ticket_reads_guard BEFORE UPDATE ON "sd_ticket_reads" FOR EACH ROW EXECUTE FUNCTION sd_privacy_copy_only();

-- ---------------------------------------------------------------------------------------------
-- P14 meter ledger (§6.3): one row per company, meter and day, written by the daily job. Append-only. The monthly
-- count of meter 'sd_agents' is the distinct people across the month's rows (D2: an agent on any day, counted once).
CREATE TABLE "meter_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "meter" VARCHAR(40) NOT NULL,
    "on_day" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subject_ids" UUID[] NOT NULL DEFAULT '{}',
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "meter_events_day_key" UNIQUE ("organization_id", "meter", "on_day"),
    CONSTRAINT "meter_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "meter_events_meter_check" CHECK ("meter" ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT "meter_events_quantity_check" CHECK ("quantity" >= 0 AND "quantity" = cardinality("subject_ids"))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "meter_events" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Copies of the ticket's privacy facts on the new child tables (§5.7). A standalone task has no ticket to copy from.
CREATE FUNCTION sd_ticket_child_copy_opt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_id IS NULL THEN RETURN NEW; END IF;
  SELECT t.sensitive, t.private INTO NEW.sensitive, NEW.private
  FROM sd_tickets t WHERE t.organization_id = NEW.organization_id AND t.id = NEW.ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such ticket' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_side_conversations_copy BEFORE INSERT ON "sd_side_conversations" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy_opt();
CREATE TRIGGER sd_tasks_copy BEFORE INSERT ON "sd_tasks" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy_opt();
CREATE TRIGGER sd_sensitive_values_copy BEFORE INSERT ON "sd_sensitive_values" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy_opt();
CREATE TRIGGER sd_ticket_reads_copy BEFORE INSERT ON "sd_ticket_reads" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy_opt();

CREATE OR REPLACE FUNCTION sd_tickets_sync_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sensitive IS DISTINCT FROM OLD.sensitive OR NEW.private IS DISTINCT FROM OLD.private THEN
    UPDATE sd_ticket_messages SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_attachments SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_ticket_events SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_side_conversations SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_tasks SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_sensitive_values SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_ticket_reads SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14, §5.1).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_ticket_links', 'sd_side_conversations', 'sd_tasks', 'sd_templates', 'sd_resolution_codes',
    'sd_reminders', 'sd_calendar_feeds', 'sd_sensitive_values', 'sd_ticket_reads', 'meter_events']
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
-- §5.7 visibility layer, in the database: a RESTRICTIVE policy ANDed with tenant_isolation. A sensitive or private
-- record, or any record on a restricted desk, is visible only to its requester and requested-for person, the desk's
-- agents and leads today, and collaborators added to it who still hold a seat. Never by role alone: there is no
-- super-admin escape. The only other way in is app.sd_system, set by the desk's own background jobs (SLA timers,
-- virus scan, auto-close, reminders) and the seed inside their own transactions; no request path sets it.

CREATE FUNCTION sd_system() RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT current_setting('app.sd_system', true) IS NOT DISTINCT FROM 'on' $$;

-- The persons behind the signed-in login (P01 §4.5a login role), and persons HR merged into them.
CREATE FUNCTION app_current_person_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  WITH me AS (
    SELECT r.person_id FROM person_roles r
    WHERE r.organization_id = app_current_org() AND r.role_type = 'login' AND r.source_table = 'users'
      AND r.source_id = app_current_user_id() AND r.end_on IS NULL)
  SELECT coalesce(array_agg(x.id), '{}') FROM (
    SELECT person_id AS id FROM me
    UNION SELECT p.id FROM persons p WHERE p.organization_id = app_current_org() AND p.merged_into IN (SELECT person_id FROM me)) x
$$;

CREATE FUNCTION sd_ticket_visible(p_org uuid, p_desk uuid, p_ticket uuid, p_sensitive boolean, p_private boolean, p_requester uuid, p_for uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT sd_system()
    OR (NOT p_sensitive AND NOT p_private AND NOT EXISTS (SELECT 1 FROM sd_desks d WHERE d.organization_id = p_org AND d.id = p_desk AND d.privacy = 'restricted'))
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

-- A child row is visible when it is plainly standard, or when its ticket is visible (the ticket's own policy decides).
CREATE FUNCTION sd_ticket_child_visible(p_org uuid, p_desk uuid, p_ticket uuid, p_sensitive boolean, p_private boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT sd_system()
    OR p_ticket IS NULL
    OR (NOT p_sensitive AND NOT p_private AND NOT EXISTS (SELECT 1 FROM sd_desks d WHERE d.organization_id = p_org AND d.id = p_desk AND d.privacy = 'restricted'))
    OR EXISTS (SELECT 1 FROM sd_tickets t WHERE t.organization_id = p_org AND t.id = p_ticket)
$$;

CREATE POLICY sd_visibility ON "sd_tickets" AS RESTRICTIVE
  USING (sd_ticket_visible(organization_id, desk_id, id, sensitive, private, requester_person_id, requested_for_person_id));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_ticket_messages', 'sd_attachments', 'sd_ticket_events', 'sd_side_conversations', 'sd_tasks',
    'sd_sensitive_values', 'sd_ticket_reads']
  LOOP
    EXECUTE format('CREATE POLICY sd_visibility ON %I AS RESTRICTIVE USING (sd_ticket_child_visible(organization_id, desk_id, ticket_id, sensitive, private))', t);
  END LOOP;
END $$;

-- A link shows only when both of its tickets do.
CREATE POLICY sd_visibility ON "sd_ticket_links" AS RESTRICTIVE
  USING (sd_system() OR (EXISTS (SELECT 1 FROM sd_tickets a WHERE a.organization_id = sd_ticket_links.organization_id AND a.id = from_ticket_id)
                     AND EXISTS (SELECT 1 FROM sd_tickets b WHERE b.organization_id = sd_ticket_links.organization_id AND b.id = to_ticket_id)));

-- Reminders, snoozes and the calendar feed belong to one person.
CREATE POLICY sd_owner_only ON "sd_reminders" AS RESTRICTIVE USING (sd_system() OR user_id = app_current_user_id());
CREATE POLICY sd_owner_only ON "sd_calendar_feeds" AS RESTRICTIVE USING (sd_system() OR user_id = app_current_user_id());

-- ---------------------------------------------------------------------------------------------
-- §6.2 keys used from this batch on are already in the 3b-1 key list (desk.task.work, desk.audit.view,
-- desk.pii.unmask, desk.report.view). Nothing new to insert.
