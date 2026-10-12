-- Performance batch PM2 (M06-BUILD-DESIGN §5.3, §7; PM-2.01 … 2.03): goal periods, goals owned by a person, a team
-- (department) or the company, aligned to a parent owned by anyone (YX-PERF-01), key results whose progress is
-- worked out (never typed when key results exist), and check-ins (append-only). Forced RLS + tenant_isolation.

CREATE TABLE "goal_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goal_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goal_periods_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "goal_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "goal_periods_dates_check" CHECK ("to_on" > "from_on"),
    CONSTRAINT "goal_periods_status_check" CHECK ("status" IN ('open', 'closed'))
);
CREATE UNIQUE INDEX "goal_periods_name_key" ON "goal_periods" ("organization_id", lower("name"));

CREATE TABLE "goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "owner_type" VARCHAR(8) NOT NULL,
    "owner_employee_id" UUID,
    "owner_department_id" UUID,
    "parent_goal_id" UUID,
    "kind" VARCHAR(4) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "wf_request_id" UUID,
    "pending_change" JSONB,
    "decision_note" VARCHAR(500),
    "checkin_reminded_on" DATE,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goals_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "goals_period_fkey" FOREIGN KEY ("organization_id", "period_id") REFERENCES "goal_periods"("organization_id", "id"),
    CONSTRAINT "goals_employee_fkey" FOREIGN KEY ("organization_id", "owner_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "goals_department_fkey" FOREIGN KEY ("organization_id", "owner_department_id") REFERENCES "departments"("organization_id", "id"),
    CONSTRAINT "goals_parent_fkey" FOREIGN KEY ("organization_id", "parent_goal_id") REFERENCES "goals"("organization_id", "id"),
    CONSTRAINT "goals_owner_check" CHECK (
        ("owner_type" = 'person' AND "owner_employee_id" IS NOT NULL AND "owner_department_id" IS NULL)
     OR ("owner_type" = 'team' AND "owner_department_id" IS NOT NULL AND "owner_employee_id" IS NULL)
     OR ("owner_type" = 'company' AND "owner_employee_id" IS NULL AND "owner_department_id" IS NULL)),
    CONSTRAINT "goals_kind_check" CHECK ("kind" IN ('okr', 'kpi')),
    CONSTRAINT "goals_status_check" CHECK ("status" IN ('draft', 'submitted', 'active', 'done', 'dropped')),
    CONSTRAINT "goals_weight_check" CHECK ("weight" BETWEEN 0 AND 100),
    CONSTRAINT "goals_progress_check" CHECK ("progress" BETWEEN 0 AND 100),
    CONSTRAINT "goals_parent_self_check" CHECK ("parent_goal_id" IS NULL OR "parent_goal_id" <> "id")
);
CREATE INDEX "goals_owner_idx" ON "goals" ("organization_id", "period_id", "owner_employee_id");
CREATE INDEX "goals_parent_idx" ON "goals" ("organization_id", "parent_goal_id") WHERE "parent_goal_id" IS NOT NULL;

CREATE TABLE "key_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "seq" SMALLINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(20),
    "direction" VARCHAR(4) NOT NULL DEFAULT 'up',
    "start_value" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "target_value" DECIMAL(16,4) NOT NULL,
    "current_value" DECIMAL(16,4) NOT NULL DEFAULT 0,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    CONSTRAINT "key_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "key_results_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "key_results_seq_key" UNIQUE ("goal_id", "seq"),
    CONSTRAINT "key_results_goal_fkey" FOREIGN KEY ("organization_id", "goal_id") REFERENCES "goals"("organization_id", "id"),
    CONSTRAINT "key_results_direction_check" CHECK ("direction" IN ('up', 'down', 'hit')),
    CONSTRAINT "key_results_target_check" CHECK ("direction" = 'hit' OR "target_value" <> "start_value"),
    CONSTRAINT "key_results_weight_check" CHECK ("weight" > 0 AND "weight" <= 100)
);

CREATE TABLE "goal_checkins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "by_user_id" UUID,
    "on" DATE NOT NULL,
    "values" JSONB NOT NULL,
    "progress" DECIMAL(5,2) NOT NULL,
    "confidence" VARCHAR(10) NOT NULL,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goal_checkins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goal_checkins_goal_fkey" FOREIGN KEY ("organization_id", "goal_id") REFERENCES "goals"("organization_id", "id"),
    CONSTRAINT "goal_checkins_confidence_check" CHECK ("confidence" IN ('on_track', 'at_risk', 'off_track')),
    CONSTRAINT "goal_checkins_progress_check" CHECK ("progress" BETWEEN 0 AND 100)
);
CREATE INDEX "goal_checkins_goal_idx" ON "goal_checkins" ("organization_id", "goal_id", "created_at" DESC);

-- ---------------------------------------------------------------------------------------------- RLS (§5.10)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['goal_periods', 'goals', 'key_results', 'goal_checkins']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
-- Goals are dropped, never erased; check-ins are a history (§5.1).
REVOKE DELETE, TRUNCATE ON TABLE "goal_periods" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "goals" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "goal_checkins" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- permission keys (§17)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.goal.view', 'Read the goals and check-ins of the people in scope'),
  (gen_random_uuid(), 'perf.goal.manage', 'Goal periods, and company and team goals')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('perf.goal.view', 'perf.goal.manage')
ON CONFLICT DO NOTHING;
