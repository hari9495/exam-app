-- G3d (M07): skills profile and suggestions (LRN-10, LRN-15), the manager's team skills (LRN-09), training needs and
-- department budgets (LRN-11), and courses that count as POSH awareness training (answer 2624).

-- A person's confirmed level of a library skill (company_skills), and what set it.
CREATE TABLE "learning_skill_levels" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_skill_id" UUID NOT NULL,
    "level" SMALLINT NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "evidence" VARCHAR(200),
    "set_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_skill_levels_pkey" PRIMARY KEY ("employee_id", "company_skill_id"),
    CONSTRAINT "learning_skill_levels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_skill_levels_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_skill_levels_skill_fkey" FOREIGN KEY ("company_skill_id") REFERENCES "company_skills"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_skill_levels_level_check" CHECK ("level" BETWEEN 1 AND 5),
    CONSTRAINT "learning_skill_levels_source_check" CHECK ("source" IN ('course', 'manager'))
);
CREATE INDEX "learning_skill_levels_org_idx" ON "learning_skill_levels"("organization_id", "employee_id");

-- A suggested level from evidence (a completed course), pending until the person or their manager decides; a rejected
-- one is never offered again from the same evidence.
CREATE TABLE "learning_skill_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_skill_id" UUID NOT NULL,
    "level" SMALLINT NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "source_ref" UUID NOT NULL,
    "evidence" VARCHAR(200) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_skill_suggestions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_skill_suggestions_once" UNIQUE ("employee_id", "company_skill_id", "source_ref"),
    CONSTRAINT "learning_skill_suggestions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_skill_suggestions_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_skill_suggestions_skill_fkey" FOREIGN KEY ("company_skill_id") REFERENCES "company_skills"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_skill_suggestions_level_check" CHECK ("level" BETWEEN 1 AND 5),
    CONSTRAINT "learning_skill_suggestions_source_check" CHECK ("source" IN ('course')),
    CONSTRAINT "learning_skill_suggestions_status_check" CHECK ("status" IN ('pending', 'confirmed', 'rejected'))
);
CREATE INDEX "learning_skill_suggestions_org_idx" ON "learning_skill_suggestions"("organization_id", "employee_id");

-- A training need (LRN-11) for a person or a department, about a topic or library skill; planned by linking a course.
CREATE TABLE "learning_needs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "employee_id" UUID,
    "department_id" UUID,
    "company_skill_id" UUID,
    "source" VARCHAR(12) NOT NULL,
    "priority" VARCHAR(6) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'new',
    "course_id" UUID,
    "est_cost" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "raised_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "learning_needs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_needs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_needs_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_needs_department_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_needs_skill_fkey" FOREIGN KEY ("company_skill_id") REFERENCES "company_skills"("id") ON DELETE SET NULL,
    CONSTRAINT "learning_needs_course_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE SET NULL,
    CONSTRAINT "learning_needs_for_check" CHECK (("employee_id" IS NULL) <> ("department_id" IS NULL)),
    CONSTRAINT "learning_needs_source_check" CHECK ("source" IN ('skill_gap', 'manager', 'compliance', 'review')),
    CONSTRAINT "learning_needs_priority_check" CHECK ("priority" IN ('high', 'medium', 'low')),
    CONSTRAINT "learning_needs_status_check" CHECK ("status" IN ('new', 'planned', 'in_progress', 'closed')),
    CONSTRAINT "learning_needs_cost_check" CHECK ("est_cost" >= 0)
);
CREATE INDEX "learning_needs_org_idx" ON "learning_needs"("organization_id", "status");

-- A department's training budget for a financial year (April to March; "year" is the April's year).
CREATE TABLE "learning_budgets" (
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" NUMERIC(14, 2) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_budgets_pkey" PRIMARY KEY ("department_id", "year"),
    CONSTRAINT "learning_budgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_budgets_department_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_budgets_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "learning_budgets_year_check" CHECK ("year" BETWEEN 2000 AND 2100)
);
CREATE INDEX "learning_budgets_org_idx" ON "learning_budgets"("organization_id", "year");

-- Answer 2624: completions of a course marked as POSH awareness count in the Internal Committee's annual report.
ALTER TABLE "learning_courses" ADD COLUMN "posh_awareness" BOOLEAN NOT NULL DEFAULT false;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_skill_levels', 'learning_skill_suggestions', 'learning_needs', 'learning_budgets']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
