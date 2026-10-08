-- Two shared platform engines, built first for the Service Desk ESM phase (M14 §4 "built first time needed", slices
-- SD-2.01, SD-2.05, SD-2.12) and meant for the whole product (leave, attendance, expenses, approvals):
--   P19 rules: named, versioned company rules ("when … if … then …") on a record type a module registers; a version
--       is immutable; every run leaves a trace; outbound webhooks keep their secret encrypted.
--   P03 approvals: requests with their steps frozen at submit, one task per approver, an append-only action log, and
--       delegations (by hand, or from approved leave through the delegateForLeave seam).
-- The table names leave the hiring approvals (approval_chains / approval_requests / approval_decisions) alone; those
-- move onto P03 later (P03 §8).
--
-- Every new table: organization_id NOT NULL + forced RLS with the standard tenant_isolation policy, composite keys.

-- ---------------------------------------------------------------------------------------------
-- P19.
CREATE TABLE "rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    -- The module that registered the record type, and the record type itself (e.g. desk / desk.ticket).
    "owner_module" VARCHAR(20) NOT NULL,
    "record_type" VARCHAR(40) NOT NULL,
    "kind" VARCHAR(12) NOT NULL DEFAULT 'automation',
    -- What the rule is limited to inside the module (a desk for desk rules); checked by the module.
    "scope_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "status" VARCHAR(8) NOT NULL DEFAULT 'draft',
    "paused_reason" VARCHAR(300),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    -- Later rules of the same record type do not run once this one matched.
    "stop_after" BOOLEAN NOT NULL DEFAULT false,
    -- US-G-051: a rule over its limit stops (status paused) and the admin is told.
    "max_runs_per_hour" INTEGER NOT NULL DEFAULT 200,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "recipe_key" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rules_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rules_record_type_check" CHECK ("record_type" ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
    CONSTRAINT "rules_kind_check" CHECK ("kind" IN ('automation')),
    CONSTRAINT "rules_status_check" CHECK ("status" IN ('draft', 'active', 'paused', 'retired')),
    CONSTRAINT "rules_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "rules_limit_check" CHECK ("max_runs_per_hour" BETWEEN 1 AND 10000)
);
CREATE INDEX "rules_active_idx" ON "rules"("organization_id", "record_type", "status", "sort_order");
REVOKE DELETE, TRUNCATE ON TABLE "rules" FROM app_runtime;

-- A saved version never changes (P19 YX-RULE-06): trigger, conditions and actions as checked JSON.
CREATE TABLE "rule_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "trigger" JSONB NOT NULL,
    "condition" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "change_note" VARCHAR(300),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rule_versions_version_key" UNIQUE ("organization_id", "rule_id", "version"),
    CONSTRAINT "rule_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rule_versions_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "rules"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "rule_versions" FROM app_runtime;

-- The trace (US-G-051): one row per rule per record per trigger. Kept 30 days (§10.1); webhook delivery results are
-- written back to the row's actions.
CREATE TABLE "automation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "record_type" VARCHAR(40) NOT NULL,
    "record_id" UUID NOT NULL,
    "trigger" VARCHAR(40) NOT NULL,
    "event_id" UUID,
    -- Loop protection (YX-RULE-11): a chain of runs started by one change; depth counts from 0.
    "chain_id" UUID NOT NULL,
    "depth" SMALLINT NOT NULL DEFAULT 0,
    "outcome" VARCHAR(14) NOT NULL,
    "trace" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "error" VARCHAR(500),
    "duration_ms" INTEGER,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "automation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "automation_runs_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "rules"("organization_id", "id"),
    CONSTRAINT "automation_runs_outcome_check" CHECK ("outcome" IN ('matched', 'not_matched', 'failed', 'loop_stopped', 'limit_stopped', 'dry_run'))
);
CREATE INDEX "automation_runs_rule_idx" ON "automation_runs"("organization_id", "rule_id", "at" DESC);
CREATE INDEX "automation_runs_record_idx" ON "automation_runs"("organization_id", "record_type", "record_id", "at" DESC);
CREATE INDEX "automation_runs_at_idx" ON "automation_runs"("organization_id", "at");

-- Outbound webhooks a rule may call (US-B-131): https to a public host only (common/ssrf.ts at save and at send), the
-- signing secret encrypted with the company's key, never shown again after it is made.
CREATE TABLE "automation_webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_webhooks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "automation_webhooks_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "automation_webhooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "automation_webhooks_url_check" CHECK ("url" ~ '^https://'),
    CONSTRAINT "automation_webhooks_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100)
);
REVOKE DELETE, TRUNCATE ON TABLE "automation_webhooks" FROM app_runtime;

-- Automation reads business events from the outbox with its own marker (the P04 dispatcher keeps processed_at).
-- Events from before today are not replayed.
ALTER TABLE "event_outbox" ADD COLUMN "automation_at" TIMESTAMPTZ(3);
UPDATE "event_outbox" SET "automation_at" = CURRENT_TIMESTAMP;
CREATE INDEX "event_outbox_automation_idx" ON "event_outbox"("occurred_at") WHERE "automation_at" IS NULL;

-- ---------------------------------------------------------------------------------------------
-- P03.
-- steps: the frozen route (P03 YX-WF-02): per step its name, approvers resolved at submit, quorum, reminder and
-- timeout settings. summary: what approvers see (the module chooses; never a sensitive answer).
CREATE TABLE "wf_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "request_type" VARCHAR(40) NOT NULL,
    "subject_type" VARCHAR(40) NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '[]',
    "requester_user_id" UUID,
    "raised_by_user_id" UUID,
    "steps" JSONB NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "current_step" SMALLINT NOT NULL DEFAULT 0,
    "risk" VARCHAR(6) NOT NULL DEFAULT 'normal',
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wf_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wf_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "wf_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wf_requests_requester_fkey" FOREIGN KEY ("organization_id", "requester_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "wf_requests_raised_by_fkey" FOREIGN KEY ("organization_id", "raised_by_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "wf_requests_type_check" CHECK ("request_type" ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
    CONSTRAINT "wf_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'cancelled')),
    CONSTRAINT "wf_requests_risk_check" CHECK ("risk" IN ('low', 'normal', 'high'))
);
CREATE INDEX "wf_requests_subject_idx" ON "wf_requests"("organization_id", "subject_type", "subject_id");
CREATE INDEX "wf_requests_requester_idx" ON "wf_requests"("organization_id", "requester_user_id", "status");
REVOKE DELETE, TRUNCATE ON TABLE "wf_requests" FROM app_runtime;

-- One approver's to-do for one step (P03 §5). "Pending for me" is one indexed query over open tasks.
CREATE TABLE "wf_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "step" SMALLINT NOT NULL,
    "assignee_user_id" UUID NOT NULL,
    -- Delegation: the delegate holds the task on behalf of the approver (P03 §4.4, never chained).
    "on_behalf_of_user_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "due_at" TIMESTAMPTZ(3),
    "remind_at" TIMESTAMPTZ(3),
    "reminders" SMALLINT NOT NULL DEFAULT 0,
    "escalated_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wf_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wf_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wf_tasks_request_fkey" FOREIGN KEY ("organization_id", "request_id") REFERENCES "wf_requests"("organization_id", "id"),
    CONSTRAINT "wf_tasks_assignee_fkey" FOREIGN KEY ("organization_id", "assignee_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "wf_tasks_behalf_fkey" FOREIGN KEY ("organization_id", "on_behalf_of_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "wf_tasks_status_check" CHECK ("status" IN ('open', 'approved', 'rejected', 'closed', 'skipped')),
    CONSTRAINT "wf_tasks_behalf_check" CHECK ("on_behalf_of_user_id" IS NULL OR "on_behalf_of_user_id" <> "assignee_user_id")
);
CREATE UNIQUE INDEX "wf_tasks_one_open_key" ON "wf_tasks"("request_id", "step", "assignee_user_id") WHERE "status" = 'open';
CREATE INDEX "wf_tasks_mine_idx" ON "wf_tasks"("organization_id", "assignee_user_id", "status");
CREATE INDEX "wf_tasks_due_idx" ON "wf_tasks"("due_at") WHERE "status" = 'open';
CREATE INDEX "wf_tasks_remind_idx" ON "wf_tasks"("remind_at") WHERE "status" = 'open';
REVOKE DELETE, TRUNCATE ON TABLE "wf_tasks" FROM app_runtime;

-- Every action on a request (P03 YX-WF-12), append-only: who, on behalf of whom, by which channel, why.
CREATE TABLE "wf_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "task_id" UUID,
    "step" SMALLINT,
    "actor_user_id" UUID,
    "on_behalf_of_user_id" UUID,
    "action" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(1000),
    -- SD-2.06 seam: approve from Teams / Slack / push arrives with its own channel.
    "channel" VARCHAR(8) NOT NULL DEFAULT 'web',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wf_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wf_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wf_actions_request_fkey" FOREIGN KEY ("organization_id", "request_id") REFERENCES "wf_requests"("organization_id", "id"),
    CONSTRAINT "wf_actions_action_check" CHECK ("action" IN ('submitted', 'approved', 'self_approved', 'rejected', 'auto_approved', 'auto_rejected', 'skipped', 'reminded', 'escalated', 'delegated', 'withdrawn', 'cancelled', 'closed')),
    CONSTRAINT "wf_actions_channel_check" CHECK ("channel" IN ('web', 'mobile', 'email', 'teams', 'slack', 'push', 'system'))
);
CREATE INDEX "wf_actions_request_idx" ON "wf_actions"("organization_id", "request_id", "created_at");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "wf_actions" FROM app_runtime;

-- "I'm away, X approves for me" (P03 Q3): by hand for any dates, or from approved leave (source 'leave').
CREATE TABLE "wf_delegations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delegate_user_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "request_types" TEXT[] NOT NULL DEFAULT '{}',
    "source" VARCHAR(6) NOT NULL DEFAULT 'manual',
    "revoked_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wf_delegations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wf_delegations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wf_delegations_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "wf_delegations_delegate_fkey" FOREIGN KEY ("organization_id", "delegate_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "wf_delegations_self_check" CHECK ("delegate_user_id" <> "user_id"),
    CONSTRAINT "wf_delegations_dates_check" CHECK ("ends_on" >= "starts_on" AND "ends_on" <= "starts_on" + 366),
    CONSTRAINT "wf_delegations_source_check" CHECK ("source" IN ('manual', 'leave'))
);
CREATE INDEX "wf_delegations_user_idx" ON "wf_delegations"("organization_id", "user_id", "starts_on");
REVOKE DELETE, TRUNCATE ON TABLE "wf_delegations" FROM app_runtime;

-- The cost-centre owner approves spend on that cost centre (P03 resolver "cost centre owner", US-B-125).
ALTER TABLE "cost_centres" ADD COLUMN "owner_user_id" UUID,
  ADD CONSTRAINT "cost_centres_owner_fkey" FOREIGN KEY ("organization_id", "owner_user_id") REFERENCES "users"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rules', 'rule_versions', 'automation_runs', 'automation_webhooks', 'wf_requests', 'wf_tasks', 'wf_actions', 'wf_delegations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- An outside requester's portal session never reads company rules or approvals.
    EXECUTE format('CREATE POLICY portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;
