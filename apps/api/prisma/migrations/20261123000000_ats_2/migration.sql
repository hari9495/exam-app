-- Recruitment batch AT2 (M10-BUILD-DESIGN §5; AT-2.01 … 2.04): headcount plans and requisitions on P03.
-- A plan per department and financial year (lines by designation / grade / location with a count and budget) is
-- approved through P03 'ats.headcount_plan'; a requisition (a job in draft) links to a plan line or is outside the
-- plan, and is approved through P03 'ats.requisition'. The company's existing requisition chain (approval_chains,
-- gate 'requisition') stays the route: its steps are resolved at submit and run on P03. Requests already in the older
-- engine finish there. Committed and filled are counted from the jobs, never stored.

CREATE TABLE "headcount_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "legal_entity_id" UUID,
    "fy_start" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'draft',
    "note" VARCHAR(1000),
    "wf_request_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "headcount_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "headcount_plans_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "headcount_plans_one_key" UNIQUE ("organization_id", "department_id", "fy_start"),
    CONSTRAINT "headcount_plans_department_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id"),
    CONSTRAINT "headcount_plans_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "headcount_plans_status_check" CHECK ("status" IN ('draft', 'submitted', 'approved', 'rejected')),
    CONSTRAINT "headcount_plans_fy_check" CHECK ("fy_start" BETWEEN 2000 AND 2100)
);

CREATE TABLE "headcount_plan_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "designation_id" UUID NOT NULL,
    "grade_id" UUID,
    "location_id" UUID,
    "count" INTEGER NOT NULL,
    "budget" DECIMAL(14,2),
    CONSTRAINT "headcount_plan_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "headcount_plan_lines_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "headcount_plan_lines_plan_fkey" FOREIGN KEY ("organization_id", "plan_id") REFERENCES "headcount_plans"("organization_id", "id"),
    CONSTRAINT "headcount_plan_lines_designation_fkey" FOREIGN KEY ("organization_id", "designation_id") REFERENCES "designations"("organization_id", "id"),
    CONSTRAINT "headcount_plan_lines_grade_fkey" FOREIGN KEY ("organization_id", "grade_id") REFERENCES "grades"("organization_id", "id"),
    CONSTRAINT "headcount_plan_lines_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "headcount_plan_lines_count_check" CHECK ("count" BETWEEN 1 AND 10000),
    CONSTRAINT "headcount_plan_lines_budget_check" CHECK ("budget" IS NULL OR "budget" >= 0)
);
CREATE INDEX "headcount_plan_lines_plan_idx" ON "headcount_plan_lines" ("organization_id", "plan_id");

-- Requisition facts on the job.
ALTER TABLE "jobs"
  ADD COLUMN "headcount_plan_line_id" UUID,
  ADD COLUMN "outside_plan" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "outside_plan_reason" VARCHAR(1000),
  ADD COLUMN "requisition_reason" VARCHAR(12),
  ADD COLUMN "replacement_of_employee_id" UUID,
  ADD COLUMN "budget_amount" DECIMAL(14,2),
  ADD COLUMN "target_start" DATE,
  ADD COLUMN "wf_request_id" UUID,
  ADD CONSTRAINT "jobs_plan_line_fkey" FOREIGN KEY ("organization_id", "headcount_plan_line_id") REFERENCES "headcount_plan_lines"("organization_id", "id"),
  ADD CONSTRAINT "jobs_replacement_fkey" FOREIGN KEY ("organization_id", "replacement_of_employee_id") REFERENCES "employees"("organization_id", "id"),
  ADD CONSTRAINT "jobs_requisition_reason_check" CHECK ("requisition_reason" IS NULL OR "requisition_reason" IN ('new', 'replacement')),
  ADD CONSTRAINT "jobs_budget_check" CHECK ("budget_amount" IS NULL OR "budget_amount" >= 0);
CREATE INDEX "jobs_plan_line_idx" ON "jobs" ("organization_id", "headcount_plan_line_id");

-- ---------------------------------------------------------------------------------------------- RLS (§16.1)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['headcount_plans', 'headcount_plan_lines']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- Budgets are hiring decisions (D14): never read by YukthiX support.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
REVOKE DELETE, TRUNCATE ON TABLE "headcount_plans" FROM app_runtime;
