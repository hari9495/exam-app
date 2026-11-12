-- Projects P-5, cost and margin, project expenses (PRJ-04; founder answers 1412, 1413, 1419, 1445; 12 Nov 2026).
-- Cost is worked out every night by a job with payroll access and kept only as project totals per month: approved hours
-- times each person's cost rate for the month, or their last final rate (provisional) until that month's payroll is
-- final, then restated. No session reads a person's rate. Expense lines may name a project (a company setting, off by
-- default) and whether it is re-billed to the client. Columns and one table; forced RLS on the table.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "expense_lines"
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "rebill" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "expense_lines_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id");
CREATE INDEX "expense_lines_project_idx" ON "expense_lines" ("organization_id", "project_id") WHERE "project_id" IS NOT NULL;

ALTER TABLE "timesheet_projects" ADD COLUMN "cost_alerted_pct" SMALLINT NOT NULL DEFAULT 0;

CREATE TABLE "project_costs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "people" INTEGER NOT NULL DEFAULT 0,
    "cost_paise" BIGINT NOT NULL DEFAULT 0,
    "expenses_paise" BIGINT NOT NULL DEFAULT 0,
    "rebill_paise" BIGINT NOT NULL DEFAULT 0,
    "basis" VARCHAR(11) NOT NULL DEFAULT 'provisional',
    "restated_from_paise" BIGINT,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_costs_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "project_costs_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_costs_basis_check" CHECK ("basis" IN ('provisional', 'final')),
    CONSTRAINT "project_costs_month_check" CHECK (extract(day FROM "month") = 1)
);
CREATE UNIQUE INDEX "project_costs_key" ON "project_costs" ("organization_id", "project_id", "month");

ALTER TABLE "project_costs" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "project_costs"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "project_costs" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
