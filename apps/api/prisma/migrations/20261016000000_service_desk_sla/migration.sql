-- Service Desk phase 3b-1, batch 2, part 2 (M14-BUILD-DESIGN §5.2 SLA, §8, slices SD-1.14 … SD-1.17): SLA and OLA
-- policies with effective-dated versions, one timer per measure per ticket (or per group hand-off / task for OLAs),
-- the timer's own event log (milestones fire once), and monthly compliance targets.

-- §8.3: a desk's policies are checked in order; the first whose scope matches wins and the ticket pins its version.
CREATE TABLE "sd_sla_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- sla: promise to the requester; ola: promise between groups (group hand-offs and tasks). UC joins in SD-3.25.
    "kind" VARCHAR(4) NOT NULL DEFAULT 'sla',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sla_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sla_policies_desk_id_key" UNIQUE ("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sla_policies_name_key" UNIQUE ("organization_id", "desk_id", "name"),
    CONSTRAINT "sd_sla_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sla_policies_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_sla_policies_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_sla_policies_kind_check" CHECK ("kind" IN ('sla', 'ola'))
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_sla_policies" FROM app_runtime;

-- §5.6 effective-dated: a change is a new version from a moment on; a ticket keeps the version it started with.
-- targets: [{ metric, minutes: [P1, P2, P3, P4], milestones: [{ percent, actions: [...] }] }] (checked by the API).
CREATE TABLE "sd_sla_policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- US-G-013: AND / OR over ticket fields (P19 expressions replace this shape when P19 lands).
    "scope" JSONB NOT NULL DEFAULT '{"match": "all", "rules": []}',
    "calendar_source" VARCHAR(20) NOT NULL DEFAULT 'desk',
    "calendar_id" UUID,
    "targets" JSONB NOT NULL,
    "pause_states" TEXT[] NOT NULL DEFAULT '{pending,on_hold}',
    -- §8.3: on a policy change, keep the time already used (default) or count again from the ticket's start.
    "recount" VARCHAR(12) NOT NULL DEFAULT 'keep',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sla_policy_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sla_policy_versions_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_sla_policy_versions_version_key" UNIQUE ("policy_id", "version"),
    CONSTRAINT "sd_sla_policy_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sla_policy_versions_policy_fkey" FOREIGN KEY ("organization_id", "desk_id", "policy_id") REFERENCES "sd_sla_policies"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sla_policy_versions_calendar_fkey" FOREIGN KEY ("organization_id", "calendar_id") REFERENCES "business_calendars"("organization_id", "id"),
    CONSTRAINT "sd_sla_policy_versions_source_check" CHECK ("calendar_source" IN ('desk', 'calendar', 'requester_location') AND (("calendar_source" = 'calendar') = ("calendar_id" IS NOT NULL))),
    CONSTRAINT "sd_sla_policy_versions_targets_check" CHECK (jsonb_typeof("targets") = 'array' AND jsonb_array_length("targets") BETWEEN 1 AND 10),
    CONSTRAINT "sd_sla_policy_versions_scope_check" CHECK (jsonb_typeof("scope") = 'object'),
    CONSTRAINT "sd_sla_policy_versions_pause_check" CHECK ("pause_states" <@ ARRAY['new', 'open', 'pending', 'on_hold']::text[]),
    CONSTRAINT "sd_sla_policy_versions_recount_check" CHECK ("recount" IN ('keep', 'retroactive'))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_sla_policy_versions" FROM app_runtime;

-- One row per measure per ticket (§5.2). breached_at marks a breach; the timer keeps running to show how late.
CREATE TABLE "sd_sla_timers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "policy_version_id" UUID NOT NULL,
    "kind" VARCHAR(4) NOT NULL,
    "metric" VARCHAR(20) NOT NULL,
    -- OLA: the group holding the ticket, or the task being done.
    "group_id" UUID,
    "task_id" UUID,
    "calendar_id" UUID,
    "state" VARCHAR(10) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    -- Start of the current running stretch; used_seconds counts business seconds before it.
    "resumed_at" TIMESTAMPTZ(3),
    "used_seconds" INTEGER NOT NULL DEFAULT 0,
    "target_seconds" INTEGER NOT NULL,
    "due_at" TIMESTAMPTZ(3),
    "paused_since" TIMESTAMPTZ(3),
    "pause_reason" VARCHAR(100),
    "next_milestone_percent" SMALLINT,
    "next_milestone_at" TIMESTAMPTZ(3),
    -- §8.5: every change bumps it; a delayed job carrying an older number does nothing.
    "job_version" INTEGER NOT NULL DEFAULT 0,
    "breached_at" TIMESTAMPTZ(3),
    "met_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(100),
    "breach_reason" VARCHAR(500),
    "breach_reason_by" UUID,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusion_reason" VARCHAR(500),
    "excluded_by" UUID,
    "excluded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sla_timers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sla_timers_ticket_id_key" UNIQUE ("organization_id", "ticket_id", "id"),
    CONSTRAINT "sd_sla_timers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sla_timers_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sla_timers_version_fkey" FOREIGN KEY ("organization_id", "policy_version_id") REFERENCES "sd_sla_policy_versions"("organization_id", "id"),
    CONSTRAINT "sd_sla_timers_group_fkey" FOREIGN KEY ("organization_id", "desk_id", "group_id") REFERENCES "sd_groups"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sla_timers_task_fkey" FOREIGN KEY ("organization_id", "desk_id", "task_id") REFERENCES "sd_tasks"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_sla_timers_calendar_fkey" FOREIGN KEY ("organization_id", "calendar_id") REFERENCES "business_calendars"("organization_id", "id"),
    CONSTRAINT "sd_sla_timers_kind_check" CHECK ("kind" IN ('sla', 'ola')),
    CONSTRAINT "sd_sla_timers_metric_check" CHECK ("metric" IN ('assign', 'first_response', 'next_response', 'resolution', 'group', 'task')),
    CONSTRAINT "sd_sla_timers_state_check" CHECK ("state" IN ('running', 'paused', 'met', 'cancelled') AND (("state" = 'running') = ("resumed_at" IS NOT NULL))),
    CONSTRAINT "sd_sla_timers_target_check" CHECK ("target_seconds" > 0 AND "used_seconds" >= 0)
);
CREATE INDEX "sd_sla_timers_ticket_idx" ON "sd_sla_timers"("organization_id", "ticket_id");
-- §8.5 safety sweep: only running timers whose next milestone is due.
CREATE INDEX "sd_sla_timers_sweep_idx" ON "sd_sla_timers"("next_milestone_at") WHERE "state" = 'running';
CREATE INDEX "sd_sla_timers_report_idx" ON "sd_sla_timers"("organization_id", "desk_id", "metric", "met_at");
-- One live timer per measure (per group for the group OLA, per task for task OLAs).
CREATE UNIQUE INDEX "sd_sla_timers_live_key" ON "sd_sla_timers"("organization_id", "ticket_id", "kind", "metric", COALESCE("task_id", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "state" IN ('running', 'paused');
REVOKE DELETE, TRUNCATE ON TABLE "sd_sla_timers" FROM app_runtime;

-- §8.4 timer log: start, pause and resume with their reason, milestones, breach, met, cancel. A milestone percent
-- fires once per timer (the unique index is the exactly-once lock of §8.5).
CREATE TABLE "sd_sla_timer_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "timer_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "percent" SMALLINT,
    "job_version" INTEGER,
    "reason" VARCHAR(500),
    "by_user_id" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sla_timer_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sla_timer_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sla_timer_events_timer_fkey" FOREIGN KEY ("organization_id", "ticket_id", "timer_id") REFERENCES "sd_sla_timers"("organization_id", "ticket_id", "id"),
    CONSTRAINT "sd_sla_timer_events_kind_check" CHECK ("kind" IN ('start', 'pause', 'resume', 'milestone', 'breach', 'met', 'cancel', 'restart', 'reason', 'exclusion', 'target'))
);
CREATE INDEX "sd_sla_timer_events_timer_idx" ON "sd_sla_timer_events"("organization_id", "timer_id", "at");
CREATE UNIQUE INDEX "sd_sla_timer_events_milestone_key" ON "sd_sla_timer_events"("timer_id", "percent") WHERE "kind" = 'milestone';
REVOKE DELETE, TRUNCATE ON TABLE "sd_sla_timer_events" FROM app_runtime;
CREATE TRIGGER sd_sla_timer_events_guard BEFORE UPDATE ON "sd_sla_timer_events" FOR EACH ROW EXECUTE FUNCTION sd_privacy_copy_only();

-- US-G-015 monthly compliance targets, e.g. 95 % of P2 resolutions on time.
CREATE TABLE "sd_sla_compliance_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "metric" VARCHAR(20) NOT NULL,
    "priority" SMALLINT,
    "target_percent" NUMERIC(5, 2) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_sla_compliance_targets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_sla_compliance_targets_key" UNIQUE NULLS NOT DISTINCT ("organization_id", "desk_id", "metric", "priority"),
    CONSTRAINT "sd_sla_compliance_targets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_sla_compliance_targets_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_sla_compliance_targets_metric_check" CHECK ("metric" IN ('assign', 'first_response', 'next_response', 'resolution', 'group', 'task')),
    CONSTRAINT "sd_sla_compliance_targets_priority_check" CHECK ("priority" IS NULL OR "priority" BETWEEN 1 AND 4),
    CONSTRAINT "sd_sla_compliance_targets_percent_check" CHECK ("target_percent" > 0 AND "target_percent" <= 100)
);

-- Privacy copies on timers and their log, kept in step with the ticket (§5.7).
CREATE TRIGGER sd_sla_timers_copy BEFORE INSERT ON "sd_sla_timers" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy_opt();
CREATE TRIGGER sd_sla_timer_events_copy BEFORE INSERT ON "sd_sla_timer_events" FOR EACH ROW EXECUTE FUNCTION sd_ticket_child_copy_opt();

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
    UPDATE sd_sla_timers SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
    UPDATE sd_sla_timer_events SET sensitive = NEW.sensitive, private = NEW.private WHERE organization_id = NEW.organization_id AND ticket_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_sla_policies', 'sd_sla_policy_versions', 'sd_sla_timers', 'sd_sla_timer_events', 'sd_sla_compliance_targets']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['sd_sla_timers', 'sd_sla_timer_events']
  LOOP
    EXECUTE format('CREATE POLICY sd_visibility ON %I AS RESTRICTIVE USING (sd_ticket_child_visible(organization_id, desk_id, ticket_id, sensitive, private))', t);
  END LOOP;
END $$;
