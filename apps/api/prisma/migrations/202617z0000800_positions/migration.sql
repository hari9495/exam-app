-- Enterprise E1 (founder answers 2340, 2341, 2641-2643; Oracle O1-O6, O8, O9): positions. A position is one seat (or
-- several, headcount) in a legal entity, department, location and designation, with valid grades, FTE, a supervisor
-- seat, a cost centre and a proposed entry salary. Its details are dated (position_versions: the version in force on a
-- day is the latest valid_from on or before it). Every create, change, freeze, activate and eliminate is a request
-- (position_changes) approved through P03 'org.position_change'; switching positions on is a two-person plan that
-- builds one seat per group of current assignments. Positions are a company setting, off by default
-- (org.positions.enabled).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'org.position.manage', 'Positions: create, change, freeze and eliminate seats (approved by someone else), mass update, and the switch-on plan')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'org.position.manage'
ON CONFLICT DO NOTHING;

CREATE TABLE "positions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "legal_entity_id" UUID NOT NULL,
  "code" VARCHAR(20) NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "positions_code_key" ON "positions" ("organization_id", "code");
CREATE INDEX "positions_entity_idx" ON "positions" ("organization_id", "legal_entity_id");

CREATE TABLE "position_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "position_id" UUID NOT NULL REFERENCES "positions"("id") ON DELETE CASCADE,
  "valid_from" DATE NOT NULL,
  "status" VARCHAR(12) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "department_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "designation_id" UUID NOT NULL,
  "grade_ids" UUID[] NOT NULL DEFAULT '{}',
  "default_grade_id" UUID,
  "fte" DECIMAL(4,2) NOT NULL DEFAULT 1,
  "headcount" INTEGER NOT NULL DEFAULT 1,
  "supervisor_position_id" UUID REFERENCES "positions"("id"),
  "cost_centre_id" UUID,
  "entry_salary" DECIMAL(14,2),
  "change_id" UUID,
  "recorded_by" UUID,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "position_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "position_versions_status_check" CHECK ("status" IN ('proposed', 'active', 'frozen', 'eliminated')),
  CONSTRAINT "position_versions_size_check" CHECK ("headcount" BETWEEN 1 AND 10000 AND "fte" > 0 AND "fte" <= 1),
  CONSTRAINT "position_versions_salary_check" CHECK ("entry_salary" IS NULL OR "entry_salary" > 0)
);
CREATE UNIQUE INDEX "position_versions_day_key" ON "position_versions" ("organization_id", "position_id", "valid_from");

CREATE TABLE "position_changes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "batch_id" UUID NOT NULL,
  "kind" VARCHAR(12) NOT NULL,
  "position_id" UUID REFERENCES "positions"("id"),
  "legal_entity_id" UUID NOT NULL,
  "effective_on" DATE NOT NULL,
  "values" JSONB NOT NULL DEFAULT '{}',
  "reason" VARCHAR(500) NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'submitted',
  "wf_request_id" UUID,
  "result" JSONB,
  "requested_by" UUID NOT NULL,
  "decided_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ(3),
  CONSTRAINT "position_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "position_changes_kind_check" CHECK ("kind" IN ('create', 'change', 'freeze', 'activate', 'eliminate', 'switch_on')),
  CONSTRAINT "position_changes_status_check" CHECK ("status" IN ('submitted', 'approved', 'rejected', 'withdrawn'))
);
CREATE INDEX "position_changes_batch_idx" ON "position_changes" ("organization_id", "batch_id");
CREATE INDEX "position_changes_position_idx" ON "position_changes" ("organization_id", "position_id", "status");

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['positions', 'position_versions', 'position_changes'] LOOP
    EXECUTE format('REVOKE DELETE, TRUNCATE ON TABLE %I FROM app_runtime', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
    EXECUTE format('CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL)', t);
  END LOOP;
END $$;
-- A version is history: never changed once written (a later change is a new version).
REVOKE UPDATE ON TABLE "position_versions" FROM app_runtime;

-- A person's seat is part of their dated assignment (a change sets it, like the grade); jobs and plan lines may name one.
ALTER TABLE "employee_assignments" ADD COLUMN "position_id" UUID REFERENCES "positions"("id");
CREATE INDEX "employee_assignments_position_idx" ON "employee_assignments" ("organization_id", "position_id") WHERE "position_id" IS NOT NULL;
ALTER TABLE "jobs" ADD COLUMN "position_id" UUID REFERENCES "positions"("id");
ALTER TABLE "headcount_plan_lines" ADD COLUMN "position_id" UUID REFERENCES "positions"("id");
