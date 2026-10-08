-- Service Desk phase 3b-1, batch 1 (M14-BUILD-DESIGN §5.2, slices SD-1.01 … SD-1.08): desks with dated members,
-- groups, categories, ticket types, status labels over fixed system states, the impact × urgency matrix, shared
-- business calendars (P03 will use them too), tickets with their messages, attachments, watchers, collaborators,
-- timeline, time entries, canned replies, scenarios and saved views; the shared event outbox (P04 YX-NTF-01).
--
-- Every table: organization_id NOT NULL + forced RLS with the standard tenant_isolation policy, and composite
-- (organization_id, …) keys, so no row can point at another company's row. Things that belong to a desk point at
-- (organization_id, desk_id, id), so a ticket's status, type, category and group are always its own desk's.
-- Child rows of a ticket carry copies of desk_id, sensitive and private (kept in step by triggers), so the
-- record-visibility policy of SD-1.12 (§5.7) can be added later as a plain column check.

-- ---------------------------------------------------------------------------------------------
-- P04 §4 event_outbox: business events written in the same transaction as the change (YX-NTF-01). The dispatcher
-- that drains it is P04 work; rows wait with processed_at NULL until then.
CREATE TABLE "event_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_outbox_type_check" CHECK ("event_type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);
CREATE INDEX "event_outbox_pending_idx" ON "event_outbox"("occurred_at") WHERE "processed_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "event_outbox" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- §5.2 shared business calendars: a time zone, weekly hours (dated) and holidays. Shared with P03 approvals.
CREATE TABLE "business_calendars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- IANA zone, checked by the API (luxon).
    "time_zone" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_calendars_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_calendars_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "business_calendars_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "business_calendars_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "business_calendars_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "business_calendars_zone_check" CHECK ("time_zone" ~ '^[A-Za-z][A-Za-z0-9_+/-]{1,63}$')
);

-- Working hours, effective-dated (§5.6): hours change, old tickets keep old maths. Several slices a day are allowed
-- (9–13 and 14–18); they may not overlap on the same weekday and dates.
CREATE TABLE "business_calendar_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    -- ISO weekday: 1 = Monday … 7 = Sunday.
    "weekday" SMALLINT NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_calendar_hours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_calendar_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "business_calendar_hours_calendar_fkey" FOREIGN KEY ("organization_id", "calendar_id") REFERENCES "business_calendars"("organization_id", "id"),
    CONSTRAINT "business_calendar_hours_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7),
    CONSTRAINT "business_calendar_hours_minutes_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute"),
    CONSTRAINT "business_calendar_hours_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "business_calendar_hours_no_overlap" EXCLUDE USING gist (
        "organization_id" WITH =, "calendar_id" WITH =, "weekday" WITH =,
        daterange("valid_from", "valid_to", '[]') WITH &&, int4range("start_minute", "end_minute") WITH &&)
);
CREATE INDEX "business_calendar_hours_calendar_idx" ON "business_calendar_hours"("organization_id", "calendar_id");

-- Past facts never change (§5.6): a row already in force may only be closed (valid_to from today on); only rows
-- that have not started yet may be removed.
CREATE FUNCTION business_calendar_hours_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- pg_trigger_depth() > 1: removed with its company (P14 tenant purge cascade), not by the app.
    IF OLD.valid_from <= today AND pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'working hours already in force are kept; close them instead' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.calendar_id <> OLD.calendar_id OR NEW.weekday <> OLD.weekday OR NEW.start_minute <> OLD.start_minute
     OR NEW.end_minute <> OLD.end_minute OR NEW.valid_from <> OLD.valid_from THEN
    RAISE EXCEPTION 'working hours are never rewritten; add new hours from a date' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.valid_to IS DISTINCT FROM OLD.valid_to AND (NEW.valid_to IS NULL OR NEW.valid_to < today - 1) THEN
    RAISE EXCEPTION 'working hours can only be closed from yesterday on' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER business_calendar_hours_guard BEFORE UPDATE OR DELETE ON "business_calendar_hours"
  FOR EACH ROW EXECUTE FUNCTION business_calendar_hours_guard();

CREATE TABLE "business_calendar_holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "holiday_on" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- Only the first half of that day's working time counts.
    "half_day" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_calendar_holidays_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_calendar_holidays_day_key" UNIQUE ("organization_id", "calendar_id", "holiday_on"),
    CONSTRAINT "business_calendar_holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "business_calendar_holidays_calendar_fkey" FOREIGN KEY ("organization_id", "calendar_id") REFERENCES "business_calendars"("organization_id", "id"),
    CONSTRAINT "business_calendar_holidays_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100)
);

-- ---------------------------------------------------------------------------------------------
-- §5.2 desks. kind and key are fixed at creation (D4, D11d): kind 'customer_support' is a Customer support desk,
-- every other kind an Employee help desk (D8). billing_class is set by the system from the company's products (§6.3).
CREATE TABLE "sd_desks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "key" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "billing_class" VARCHAR(16) NOT NULL,
    "privacy" VARCHAR(10) NOT NULL DEFAULT 'standard',
    "calendar_id" UUID,
    -- US-G-214: number = prefix + running number + suffix.
    "number_prefix" VARCHAR(12) NOT NULL,
    "number_suffix" VARCHAR(12) NOT NULL DEFAULT '',
    -- US-G-031: allowed file extensions (lower case) and the size ceiling per file.
    "attachment_types" TEXT[] NOT NULL DEFAULT '{pdf,png,jpg,jpeg,gif,txt,csv,docx,xlsx,pptx}',
    "attachment_max_mb" SMALLINT NOT NULL DEFAULT 10,
    -- YX-SD-03: a VIP requester's ticket goes one priority step up.
    "vip_raises_priority" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_desks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_desks_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_desks_key_key" UNIQUE ("organization_id", "key"),
    CONSTRAINT "sd_desks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_desks_calendar_fkey" FOREIGN KEY ("organization_id", "calendar_id") REFERENCES "business_calendars"("organization_id", "id"),
    CONSTRAINT "sd_desks_key_check" CHECK ("key" ~ '^[A-Z][A-Z0-9]{1,9}$'),
    CONSTRAINT "sd_desks_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_desks_kind_check" CHECK ("kind" IN ('hr', 'it', 'admin', 'facilities', 'finance', 'legal', 'security', 'customer_support', 'custom')),
    CONSTRAINT "sd_desks_billing_check" CHECK ("billing_class" IN ('hrms_included', 'service_desk') AND ("billing_class" = 'service_desk' OR "kind" = 'hr')),
    CONSTRAINT "sd_desks_privacy_check" CHECK ("privacy" IN ('standard', 'restricted')),
    CONSTRAINT "sd_desks_prefix_check" CHECK ("number_prefix" ~ '^[A-Z0-9][A-Z0-9-]{0,11}$'),
    CONSTRAINT "sd_desks_suffix_check" CHECK ("number_suffix" ~ '^[A-Z0-9-]{0,12}$'),
    CONSTRAINT "sd_desks_types_check" CHECK (cardinality("attachment_types") BETWEEN 1 AND 40),
    CONSTRAINT "sd_desks_max_mb_check" CHECK ("attachment_max_mb" BETWEEN 1 AND 25),
    CONSTRAINT "sd_desks_status_check" CHECK ("status" IN ('active', 'archived'))
);
-- D4: one free HR desk per company inside HRMS; any second desk is a paid service desk.
CREATE UNIQUE INDEX "sd_desks_one_free_hr_key" ON "sd_desks"("organization_id") WHERE "billing_class" = 'hrms_included';
REVOKE DELETE, TRUNCATE ON TABLE "sd_desks" FROM app_runtime;

CREATE FUNCTION sd_desks_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind <> OLD.kind OR NEW.key <> OLD.key OR NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'a desk''s kind and key are fixed when it is created (D11)' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER sd_desks_guard BEFORE UPDATE ON "sd_desks" FOR EACH ROW EXECUTE FUNCTION sd_desks_guard();

-- Gap-free running numbers per desk (YX-SD-01): UPDATE … RETURNING inside the ticket's transaction.
CREATE TABLE "sd_counters" (
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "next_number" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "sd_counters_pkey" PRIMARY KEY ("desk_id"),
    CONSTRAINT "sd_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_counters_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_counters_next_check" CHECK ("next_number" BETWEEN 1 AND 9999999999)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_counters" FROM app_runtime;

-- Desk members, effective-dated (§5.6): who was an agent on which day drives access, billing and reports. A row is
-- only ever closed (valid_to); a seat added and removed on the same day closes to the day before it started, an empty
-- range that never counts (D2).
CREATE TABLE "sd_desk_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(12) NOT NULL,
    "tier" VARCHAR(2),
    "skills" TEXT[] NOT NULL DEFAULT '{}',
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by" UUID,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_desk_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_desk_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_desk_members_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_desk_members_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_desk_members_role_check" CHECK ("role" IN ('agent', 'lead', 'admin', 'collaborator')),
    CONSTRAINT "sd_desk_members_tier_check" CHECK ("tier" IS NULL OR "tier" IN ('L1', 'L2', 'L3')),
    CONSTRAINT "sd_desk_members_skills_check" CHECK (cardinality("skills") <= 20),
    CONSTRAINT "sd_desk_members_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from" - 1),
    -- One role per person per desk on any day.
    CONSTRAINT "sd_desk_members_no_overlap" EXCLUDE USING gist (
        "organization_id" WITH =, "desk_id" WITH =, "user_id" WITH =, daterange("valid_from", "valid_to" + 1, '[)') WITH &&)
);
CREATE INDEX "sd_desk_members_user_idx" ON "sd_desk_members"("organization_id", "user_id");
CREATE INDEX "sd_desk_members_desk_idx" ON "sd_desk_members"("organization_id", "desk_id");
REVOKE DELETE, TRUNCATE ON TABLE "sd_desk_members" FROM app_runtime;

CREATE FUNCTION sd_desk_members_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.desk_id <> OLD.desk_id OR NEW.user_id <> OLD.user_id OR NEW.role <> OLD.role OR NEW.valid_from <> OLD.valid_from
     OR NEW.tier IS DISTINCT FROM OLD.tier OR NEW.skills IS DISTINCT FROM OLD.skills THEN
    RAISE EXCEPTION 'a desk membership is never rewritten; end it and add a new one' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.valid_to IS NOT NULL THEN
    RAISE EXCEPTION 'an ended desk membership stays as it was' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_desk_members_guard BEFORE UPDATE ON "sd_desk_members" FOR EACH ROW EXECUTE FUNCTION sd_desk_members_guard();

-- US-G-011: an agent's own availability for automatic assignment: away (optionally until a time) and shift hours.
CREATE TABLE "sd_agent_status" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'available',
    "away_until" TIMESTAMPTZ(3),
    "shift_start_minute" SMALLINT,
    "shift_end_minute" SMALLINT,
    -- ISO weekdays of the shift (1 = Monday).
    "shift_days" SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}',
    "shift_time_zone" VARCHAR(64),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_agent_status_pkey" PRIMARY KEY ("organization_id", "user_id"),
    CONSTRAINT "sd_agent_status_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_agent_status_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_agent_status_status_check" CHECK ("status" IN ('available', 'away')),
    CONSTRAINT "sd_agent_status_shift_check" CHECK (
        ("shift_start_minute" IS NULL AND "shift_end_minute" IS NULL AND "shift_time_zone" IS NULL)
        OR ("shift_start_minute" BETWEEN 0 AND 1439 AND "shift_end_minute" BETWEEN 1 AND 1440 AND "shift_start_minute" <> "shift_end_minute" AND "shift_time_zone" IS NOT NULL)),
    CONSTRAINT "sd_agent_status_days_check" CHECK ("shift_days" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[])
);

-- Assignment groups inside a desk (§5.2).
CREATE TABLE "sd_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "tier" VARCHAR(2),
    "assignment_method" VARCHAR(12) NOT NULL DEFAULT 'manual',
    "max_open_per_agent" SMALLINT,
    -- Round-robin cursor: the member who got the last ticket.
    "last_assigned_user_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_groups_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_groups_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_groups_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_groups_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_groups_tier_check" CHECK ("tier" IS NULL OR "tier" IN ('L1', 'L2', 'L3')),
    CONSTRAINT "sd_groups_method_check" CHECK ("assignment_method" IN ('manual', 'round_robin', 'load')),
    CONSTRAINT "sd_groups_max_check" CHECK ("max_open_per_agent" IS NULL OR "max_open_per_agent" BETWEEN 1 AND 500)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_groups" FROM app_runtime;

CREATE TABLE "sd_group_members" (
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_group_members_pkey" PRIMARY KEY ("group_id", "user_id"),
    CONSTRAINT "sd_group_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_group_members_group_fkey" FOREIGN KEY ("organization_id", "desk_id", "group_id") REFERENCES "sd_groups"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_group_members_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id")
);

CREATE TABLE "sd_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    -- YX-HD-03 / §5.7: tickets in a sensitive category are visible only to the desk's agents and leads.
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "default_group_id" UUID,
    "default_priority" SMALLINT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_categories_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_categories_name_key" UNIQUE NULLS NOT DISTINCT ("organization_id", "desk_id", "parent_id", "name"),
    CONSTRAINT "sd_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_categories_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_categories_parent_fkey" FOREIGN KEY ("organization_id", "desk_id", "parent_id") REFERENCES "sd_categories"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_categories_group_fkey" FOREIGN KEY ("organization_id", "desk_id", "default_group_id") REFERENCES "sd_groups"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_categories_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_categories_priority_check" CHECK ("default_priority" IS NULL OR "default_priority" BETWEEN 1 AND 4),
    CONSTRAINT "sd_categories_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_categories" FROM app_runtime;

-- US-G-001 ticket types. 3b-3 adds problem, change and release kinds.
CREATE TABLE "sd_ticket_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ticket_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_ticket_types_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_ticket_types_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_ticket_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ticket_types_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_ticket_types_kind_check" CHECK ("kind" IN ('incident', 'request', 'question')),
    CONSTRAINT "sd_ticket_types_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_ticket_types" FROM app_runtime;

-- YX-SD-02: status labels are free text; each maps to one fixed system state. A label with no type is for every type.
CREATE TABLE "sd_statuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_type_id" UUID,
    "label" VARCHAR(60) NOT NULL,
    "system_state" VARCHAR(10) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_statuses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_statuses_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_statuses_label_key" UNIQUE NULLS NOT DISTINCT ("organization_id", "desk_id", "ticket_type_id", "label"),
    CONSTRAINT "sd_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_statuses_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_statuses_type_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_type_id") REFERENCES "sd_ticket_types"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_statuses_label_check" CHECK (char_length(btrim("label")) BETWEEN 1 AND 60),
    CONSTRAINT "sd_statuses_state_check" CHECK ("system_state" IN ('new', 'open', 'pending', 'on_hold', 'solved', 'closed'))
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_statuses" FROM app_runtime;
-- The system state of a label never changes once tickets may carry it (reports and SLA read it).
CREATE FUNCTION sd_statuses_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.system_state <> OLD.system_state OR NEW.ticket_type_id IS DISTINCT FROM OLD.ticket_type_id OR NEW.desk_id <> OLD.desk_id THEN
    RAISE EXCEPTION 'a status keeps its system state; add a new label instead' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_statuses_guard BEFORE UPDATE ON "sd_statuses" FOR EACH ROW EXECUTE FUNCTION sd_statuses_guard();

-- YX-SD-03: impact × urgency → priority (1 = P1, highest).
CREATE TABLE "sd_priority_matrix" (
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "impact" SMALLINT NOT NULL,
    "urgency" SMALLINT NOT NULL,
    "priority" SMALLINT NOT NULL,

    CONSTRAINT "sd_priority_matrix_pkey" PRIMARY KEY ("desk_id", "impact", "urgency"),
    CONSTRAINT "sd_priority_matrix_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_priority_matrix_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_priority_matrix_values_check" CHECK ("impact" BETWEEN 1 AND 4 AND "urgency" BETWEEN 1 AND 4 AND "priority" BETWEEN 1 AND 4)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_priority_matrix" FROM app_runtime;

-- US-G-004 VIP requesters, company-wide.
CREATE TABLE "sd_requester_flags" (
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(200),
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_requester_flags_pkey" PRIMARY KEY ("organization_id", "person_id"),
    CONSTRAINT "sd_requester_flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_requester_flags_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id")
);

-- ---------------------------------------------------------------------------------------------
-- §5.2 tickets: one core table for incidents, requests and questions.
CREATE TABLE "sd_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "seq" BIGINT NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "type_id" UUID NOT NULL,
    -- Copied from the type and the status by the trigger below, never by the caller.
    "kind" VARCHAR(12) NOT NULL,
    "status_id" UUID NOT NULL,
    "system_state" VARCHAR(10) NOT NULL,
    "priority" SMALLINT NOT NULL,
    "impact" SMALLINT,
    "urgency" SMALLINT,
    "category_id" UUID,
    "subject" VARCHAR(200) NOT NULL,
    "requester_person_id" UUID NOT NULL,
    "requested_for_person_id" UUID,
    "opened_by_user_id" UUID,
    "assignee_user_id" UUID,
    "group_id" UUID,
    "channel" VARCHAR(10) NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "custom" JSONB NOT NULL DEFAULT '{}',
    "first_response_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "resolution_code" VARCHAR(40),
    "resolution_note" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "number" || ' ' || "subject")) STORED,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_tickets_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_tickets_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    -- US-G-214: numbers stay unique in the company whatever the format.
    CONSTRAINT "sd_tickets_number_key" UNIQUE ("organization_id", "number"),
    CONSTRAINT "sd_tickets_seq_key" UNIQUE ("organization_id", "desk_id", "seq"),
    CONSTRAINT "sd_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_tickets_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_tickets_type_fkey" FOREIGN KEY ("organization_id", "desk_id", "type_id") REFERENCES "sd_ticket_types"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_tickets_status_fkey" FOREIGN KEY ("organization_id", "desk_id", "status_id") REFERENCES "sd_statuses"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_tickets_category_fkey" FOREIGN KEY ("organization_id", "desk_id", "category_id") REFERENCES "sd_categories"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_tickets_group_fkey" FOREIGN KEY ("organization_id", "desk_id", "group_id") REFERENCES "sd_groups"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_tickets_requester_fkey" FOREIGN KEY ("organization_id", "requester_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_tickets_requested_for_fkey" FOREIGN KEY ("organization_id", "requested_for_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_tickets_opened_by_fkey" FOREIGN KEY ("organization_id", "opened_by_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_tickets_assignee_fkey" FOREIGN KEY ("organization_id", "assignee_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_tickets_subject_check" CHECK (char_length(btrim("subject")) BETWEEN 1 AND 200),
    CONSTRAINT "sd_tickets_priority_check" CHECK ("priority" BETWEEN 1 AND 4 AND ("impact" IS NULL OR "impact" BETWEEN 1 AND 4) AND ("urgency" IS NULL OR "urgency" BETWEEN 1 AND 4)),
    CONSTRAINT "sd_tickets_channel_check" CHECK ("channel" IN ('portal', 'agent', 'api', 'email')),
    CONSTRAINT "sd_tickets_tags_check" CHECK (cardinality("tags") <= 20),
    CONSTRAINT "sd_tickets_requested_for_check" CHECK ("requested_for_person_id" IS NULL OR "requested_for_person_id" <> "requester_person_id")
);
CREATE INDEX "sd_tickets_queue_idx" ON "sd_tickets"("organization_id", "desk_id", "system_state", "priority");
CREATE INDEX "sd_tickets_assignee_idx" ON "sd_tickets"("organization_id", "assignee_user_id", "system_state");
CREATE INDEX "sd_tickets_requester_idx" ON "sd_tickets"("organization_id", "requester_person_id");
CREATE INDEX "sd_tickets_requested_for_idx" ON "sd_tickets"("organization_id", "requested_for_person_id") WHERE "requested_for_person_id" IS NOT NULL;
CREATE INDEX "sd_tickets_search_idx" ON "sd_tickets" USING gin ("search");
CREATE INDEX "sd_tickets_tags_idx" ON "sd_tickets" USING gin ("tags");
-- YX-SD-19: records are never hard-deleted.
REVOKE DELETE, TRUNCATE ON TABLE "sd_tickets" FROM app_runtime;

-- The kind and system state always come from the ticket's own type and status label (YX-SD-02).
CREATE FUNCTION sd_tickets_derive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT t.kind INTO NEW.kind FROM sd_ticket_types t WHERE t.organization_id = NEW.organization_id AND t.id = NEW.type_id;
  SELECT s.system_state INTO NEW.system_state FROM sd_statuses s WHERE s.organization_id = NEW.organization_id AND s.id = NEW.status_id;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.desk_id <> OLD.desk_id OR NEW.seq <> OLD.seq OR NEW.number <> OLD.number OR NEW.requester_person_id <> OLD.requester_person_id OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'a ticket keeps its desk, number and requester' USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_tickets_derive BEFORE INSERT OR UPDATE ON "sd_tickets" FOR EACH ROW EXECUTE FUNCTION sd_tickets_derive();

-- §6.3 / YX-SD-06, defence in depth: only someone holding an agent or lead seat on the desk today owns a ticket.
CREATE FUNCTION sd_agent_seat_held(p_org uuid, p_desk uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM sd_desk_members m
    WHERE m.organization_id = p_org AND m.desk_id = p_desk AND m.user_id = p_user AND m.role IN ('agent', 'lead')
      AND m.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND (m.valid_to IS NULL OR m.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date))
$$;
CREATE FUNCTION sd_tickets_assignee_seat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assignee_user_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assignee_user_id IS DISTINCT FROM OLD.assignee_user_id)
     AND NOT sd_agent_seat_held(NEW.organization_id, NEW.desk_id, NEW.assignee_user_id) THEN
    RAISE EXCEPTION 'DESK_AGENT_SEAT_REQUIRED: only an agent of this desk can own a ticket' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_tickets_assignee_seat BEFORE INSERT OR UPDATE OF "assignee_user_id" ON "sd_tickets" FOR EACH ROW EXECUTE FUNCTION sd_tickets_assignee_seat();

-- ---------------------------------------------------------------------------------------------
-- Ticket children. desk_id, sensitive and private are copies of the ticket's (set on insert, kept in step on change).
CREATE TABLE "sd_ticket_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    -- reply: seen by the requester; note: agents and collaborators only (YX-SD-13); system: written by YukthiX.
    "kind" VARCHAR(8) NOT NULL,
    "side" VARCHAR(10) NOT NULL,
    "author_user_id" UUID,
    "author_person_id" UUID,
    -- Cleaned with the sanitize-html allow-list before it is stored (§14.2).
    "body_html" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "mentions" UUID[] NOT NULL DEFAULT '{}',
    "channel" VARCHAR(10) NOT NULL,
    "edited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ticket_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_ticket_messages_ticket_id_key" UNIQUE ("organization_id", "ticket_id", "id"),
    CONSTRAINT "sd_ticket_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ticket_messages_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_ticket_messages_user_fkey" FOREIGN KEY ("organization_id", "author_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_ticket_messages_person_fkey" FOREIGN KEY ("organization_id", "author_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_ticket_messages_kind_check" CHECK ("kind" IN ('reply', 'note', 'system')),
    CONSTRAINT "sd_ticket_messages_side_check" CHECK ("side" IN ('agent', 'requester', 'system') AND ("kind" <> 'note' OR "side" = 'agent') AND (("kind" = 'system') = ("side" = 'system'))),
    CONSTRAINT "sd_ticket_messages_author_check" CHECK ("side" <> 'agent' OR "author_user_id" IS NOT NULL),
    CONSTRAINT "sd_ticket_messages_body_check" CHECK (char_length("body_html") <= 200000 AND char_length("body_text") BETWEEN 1 AND 100000),
    CONSTRAINT "sd_ticket_messages_mentions_check" CHECK (cardinality("mentions") <= 20),
    CONSTRAINT "sd_ticket_messages_channel_check" CHECK ("channel" IN ('portal', 'agent', 'api', 'email', 'system'))
);
CREATE INDEX "sd_ticket_messages_ticket_idx" ON "sd_ticket_messages"("organization_id", "ticket_id", "created_at");
REVOKE DELETE, TRUNCATE ON TABLE "sd_ticket_messages" FROM app_runtime;

CREATE TABLE "sd_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message_id" UUID,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    -- An agent's file reaches the requester only once it is sent with a reply.
    "side" VARCHAR(10) NOT NULL,
    "uploaded_by_user_id" UUID,
    "uploaded_by_person_id" UUID,
    "blob_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    -- §14.2: never served until clean. pending until the scanner answers (fail closed).
    "scan_status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "scan_detail" VARCHAR(200),
    "scanned_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_attachments_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_attachments_message_fkey" FOREIGN KEY ("organization_id", "ticket_id", "message_id") REFERENCES "sd_ticket_messages"("organization_id", "ticket_id", "id"),
    CONSTRAINT "sd_attachments_user_fkey" FOREIGN KEY ("organization_id", "uploaded_by_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_attachments_person_fkey" FOREIGN KEY ("organization_id", "uploaded_by_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_attachments_side_check" CHECK ("side" IN ('agent', 'requester')),
    CONSTRAINT "sd_attachments_name_check" CHECK (char_length(btrim("file_name")) BETWEEN 1 AND 255),
    CONSTRAINT "sd_attachments_size_check" CHECK ("size_bytes" BETWEEN 1 AND 26214400),
    CONSTRAINT "sd_attachments_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "sd_attachments_scan_check" CHECK ("scan_status" IN ('pending', 'clean', 'blocked', 'infected'))
);
CREATE INDEX "sd_attachments_ticket_idx" ON "sd_attachments"("organization_id", "ticket_id");
CREATE INDEX "sd_attachments_pending_idx" ON "sd_attachments"("created_at") WHERE "scan_status" = 'pending';
REVOKE DELETE, TRUNCATE ON TABLE "sd_attachments" FROM app_runtime;

-- US-G-004: watchers are people; colleagues inside the company or outside contacts.
CREATE TABLE "sd_ticket_watchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "external" BOOLEAN NOT NULL DEFAULT false,
    "added_by_user_id" UUID,
    "added_by_person_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ticket_watchers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_ticket_watchers_person_key" UNIQUE ("organization_id", "ticket_id", "person_id"),
    CONSTRAINT "sd_ticket_watchers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ticket_watchers_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_ticket_watchers_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id")
);
CREATE INDEX "sd_ticket_watchers_person_idx" ON "sd_ticket_watchers"("organization_id", "person_id");

-- §5.2: the only way a collaborator reaches a record (free seat, Q10): notes and their tasks, never a reply.
CREATE TABLE "sd_ticket_collaborators" (
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "added_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ticket_collaborators_pkey" PRIMARY KEY ("ticket_id", "user_id"),
    CONSTRAINT "sd_ticket_collaborators_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ticket_collaborators_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_ticket_collaborators_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id")
);
CREATE INDEX "sd_ticket_collaborators_user_idx" ON "sd_ticket_collaborators"("organization_id", "user_id");

-- YX-AUD-05: the ticket's business timeline. requester_visible marks what the requester may see (status, not notes).
CREATE TABLE "sd_ticket_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "kind" VARCHAR(30) NOT NULL,
    "from_value" VARCHAR(300),
    "to_value" VARCHAR(300),
    "reason" VARCHAR(500),
    "requester_visible" BOOLEAN NOT NULL DEFAULT false,
    "by_user_id" UUID,
    "by_person_id" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ticket_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_ticket_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ticket_events_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_ticket_events_kind_check" CHECK ("kind" ~ '^[a-z_]{2,30}$')
);
CREATE INDEX "sd_ticket_events_ticket_idx" ON "sd_ticket_events"("organization_id", "ticket_id", "at");
REVOKE DELETE, TRUNCATE ON TABLE "sd_ticket_events" FROM app_runtime;

-- US-B-091 time tracking.
CREATE TABLE "sd_time_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "worked_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "sd_time_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_time_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_time_entries_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_time_entries_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_time_entries_minutes_check" CHECK ("minutes" BETWEEN 1 AND 1440)
);
CREATE INDEX "sd_time_entries_ticket_idx" ON "sd_time_entries"("organization_id", "ticket_id");
REVOKE DELETE, TRUNCATE ON TABLE "sd_time_entries" FROM app_runtime;

-- Saved replies: the desk's (owner NULL, kept by the desk admin) or one agent's own.
CREATE TABLE "sd_canned_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "title" VARCHAR(100) NOT NULL,
    "body_html" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_canned_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_canned_responses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_canned_responses_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_canned_responses_owner_fkey" FOREIGN KEY ("organization_id", "owner_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_canned_responses_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_canned_responses_body_check" CHECK (char_length("body_html") BETWEEN 1 AND 20000)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_canned_responses" FROM app_runtime;

-- US-G-002 one-click bundles of field changes, a note and a reply.
CREATE TABLE "sd_scenarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "actions" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_scenarios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_scenarios_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_scenarios_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_scenarios_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_scenarios_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_scenarios_actions_check" CHECK (jsonb_typeof("actions") = 'object')
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_scenarios" FROM app_runtime;

-- US-B-089 / US-G-002 saved views: personal, or shared with everyone on the desk.
CREATE TABLE "sd_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "name" VARCHAR(60) NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "columns" TEXT[] NOT NULL DEFAULT '{}',
    "sort" VARCHAR(40),
    "layout" VARCHAR(6) NOT NULL DEFAULT 'list',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_views_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_views_owner_fkey" FOREIGN KEY ("organization_id", "owner_user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_views_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
    CONSTRAINT "sd_views_shared_check" CHECK (NOT "shared" OR "desk_id" IS NOT NULL),
    CONSTRAINT "sd_views_layout_check" CHECK ("layout" IN ('list', 'board')),
    CONSTRAINT "sd_views_filters_check" CHECK (jsonb_typeof("filters") = 'object'),
    CONSTRAINT "sd_views_columns_check" CHECK (cardinality("columns") <= 20)
);
CREATE INDEX "sd_views_owner_idx" ON "sd_views"("organization_id", "owner_user_id");

-- ---------------------------------------------------------------------------------------------
-- Copies of desk privacy facts on the ticket's children (§5.7): set from the ticket on insert, kept in step when the
-- ticket's sensitive / private flags change. Notes stay editable (audited); replies and system messages never change.
CREATE FUNCTION sd_ticket_child_copy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT t.sensitive, t.private INTO NEW.sensitive, NEW.private
  FROM sd_tickets t WHERE t.organization_id = NEW.organization_id AND t.id = NEW.ticket_id;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_ticket_messages_copy BEFORE INSERT ON "sd_ticket_messages" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy();
CREATE TRIGGER sd_attachments_copy BEFORE INSERT ON "sd_attachments" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy();
CREATE TRIGGER sd_ticket_events_copy BEFORE INSERT ON "sd_ticket_events" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy();

CREATE FUNCTION sd_tickets_sync_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sensitive IS DISTINCT FROM OLD.sensitive OR NEW.private IS DISTINCT FROM OLD.private THEN
    UPDATE sd_ticket_messages SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_attachments SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_ticket_events SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_tickets_sync_children AFTER UPDATE OF "sensitive", "private" ON "sd_tickets" FOR EACH ROW EXECUTE FUNCTION sd_tickets_sync_children();

CREATE FUNCTION sd_ticket_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_id <> OLD.ticket_id OR NEW.kind <> OLD.kind OR NEW.side <> OLD.side OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
     OR NEW.author_person_id IS DISTINCT FROM OLD.author_person_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'a message keeps its ticket, kind and author' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.kind <> 'note' AND (NEW.body_html <> OLD.body_html OR NEW.body_text <> OLD.body_text OR NEW.mentions <> OLD.mentions) THEN
    RAISE EXCEPTION 'a reply sent to the requester is never edited' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_ticket_messages_guard BEFORE UPDATE ON "sd_ticket_messages" FOR EACH ROW EXECUTE FUNCTION sd_ticket_messages_guard();

-- YX-SD-06: a reply from the agent side needs an agent or lead seat on the desk today.
CREATE FUNCTION sd_ticket_messages_seat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'reply' AND NEW.side = 'agent' AND NOT sd_agent_seat_held(NEW.organization_id, NEW.desk_id, NEW.author_user_id) THEN
    RAISE EXCEPTION 'DESK_AGENT_SEAT_REQUIRED: only an agent of this desk can reply' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_ticket_messages_seat BEFORE INSERT ON "sd_ticket_messages" FOR EACH ROW EXECUTE FUNCTION sd_ticket_messages_seat();

CREATE FUNCTION sd_ticket_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.ticket_id, NEW.kind, NEW.from_value, NEW.to_value, NEW.reason, NEW.requester_visible, NEW.by_user_id, NEW.by_person_id, NEW.at)
     IS DISTINCT FROM ROW(OLD.ticket_id, OLD.kind, OLD.from_value, OLD.to_value, OLD.reason, OLD.requester_visible, OLD.by_user_id, OLD.by_person_id, OLD.at) THEN
    RAISE EXCEPTION 'the timeline is append-only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_ticket_events_guard BEFORE UPDATE ON "sd_ticket_events" FOR EACH ROW EXECUTE FUNCTION sd_ticket_events_guard();

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14, §5.1): the standard forced RLS + tenant_isolation policy on every new table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_outbox', 'business_calendars', 'business_calendar_hours', 'business_calendar_holidays',
    'sd_desks', 'sd_counters', 'sd_desk_members', 'sd_agent_status', 'sd_groups', 'sd_group_members', 'sd_categories',
    'sd_ticket_types', 'sd_statuses', 'sd_priority_matrix', 'sd_requester_flags', 'sd_tickets', 'sd_ticket_messages',
    'sd_attachments', 'sd_ticket_watchers', 'sd_ticket_collaborators', 'sd_ticket_events', 'sd_time_entries',
    'sd_canned_responses', 'sd_scenarios', 'sd_views']
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
-- §6.2 permission keys for phase 3b-1 (also in prisma/seed.ts). Desk reach comes from sd_desk_members, so the keys
-- are held company-wide and each desk route also checks the person's seat on that desk.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'desk.ticket.view', 'See the tickets of the desks you are on'),
  (gen_random_uuid(), 'desk.ticket.work', 'Own, be assigned and reply to tickets (a paid agent seat)'),
  (gen_random_uuid(), 'desk.ticket.note', 'Add internal notes to tickets'),
  (gen_random_uuid(), 'desk.ticket.assign', 'Assign tickets to other agents'),
  (gen_random_uuid(), 'desk.ticket.bulk', 'Change many tickets at once and share views'),
  (gen_random_uuid(), 'desk.ticket.merge', 'Merge tickets'),
  (gen_random_uuid(), 'desk.ticket.export', 'Export ticket lists as CSV'),
  (gen_random_uuid(), 'desk.ticket.purge_spam', 'Purge spam tickets'),
  (gen_random_uuid(), 'desk.task.work', 'Work on ticket tasks'),
  (gen_random_uuid(), 'desk.kb.view_internal', 'Read internal help articles'),
  (gen_random_uuid(), 'desk.kb.author', 'Write help articles'),
  (gen_random_uuid(), 'desk.kb.publish', 'Publish help articles'),
  (gen_random_uuid(), 'desk.sla.manage', 'Set business calendars and response targets'),
  (gen_random_uuid(), 'desk.settings.manage', 'Set up a desk: groups, categories, types, statuses, saved replies'),
  (gen_random_uuid(), 'desk.member.manage', 'Add and remove desk agents, leads, admins and collaborators'),
  (gen_random_uuid(), 'desk.desk.create', 'Create desks and run the Service Desk for the company'),
  (gen_random_uuid(), 'desk.portal.manage', 'Set up the help portal and banners'),
  (gen_random_uuid(), 'desk.mailbox.manage', 'Set up desk mailboxes and email rules'),
  (gen_random_uuid(), 'desk.customer.manage', 'Manage customer accounts and contacts'),
  (gen_random_uuid(), 'desk.report.view', 'See desk reports'),
  (gen_random_uuid(), 'desk.report.manage', 'Build and schedule desk reports'),
  (gen_random_uuid(), 'desk.audit.view', 'See who read which ticket'),
  (gen_random_uuid(), 'desk.pii.unmask', 'Show a masked value in a ticket (every view recorded)'),
  (gen_random_uuid(), 'desk.directory.manage', 'Set up directory sync for the Service Desk')
ON CONFLICT DO NOTHING;
-- The System Admin sets up desks (§6.1 Service Desk admin); seeing tickets always needs a seat on the desk.
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('desk.desk.create', 'desk.settings.manage', 'desk.member.manage', 'desk.sla.manage')
ON CONFLICT DO NOTHING;
