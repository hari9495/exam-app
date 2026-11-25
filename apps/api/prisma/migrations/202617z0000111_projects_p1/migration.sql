-- Projects P-1, projects core (founder answers 1401 to 1405, 1412, 1420; 12 Nov 2026).
-- 1401: Projects is switched on per company (projects.enabled, off by default). Companies that already keep Time's
--       projects get it switched on here, so nobody loses the project editor that moves out of Shifts set-up (1402).
-- 1402: Time's simple projects (timesheet_projects) grow into the designed project: one project list, never two.
-- 1403: a project's client is the staffing desk's client.
-- 1420: billing models time and material, fixed fee, retainer, non-billable; milestones with an optional client
--       acceptance (per project, off by default).
-- 1404, 1405: allocations (only allocated people book time, a setting) and burn alerts (settings 80% and 100%).
-- 1412: the Projects keys, with "Projects finance" for cost, fee and margin.
SELECT set_config('app.is_super_admin', 'on', true);

-- ---------------------------------------------------------------------------------------------
-- 1. Keys (also in prisma/seed.ts). The System Admin holds all four; companies give them through roles.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'projects.view', 'See projects, their team, tasks and milestones (no fee, cost or margin)'),
  (gen_random_uuid(), 'projects.manage', 'Create and change projects, budgets, team, tasks and milestones'),
  (gen_random_uuid(), 'projects.finance', 'Projects finance: see and set fees, cost and margin'),
  (gen_random_uuid(), 'projects.resource', 'Resource manager: allocate people across projects')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('projects.view', 'projects.manage', 'projects.finance', 'projects.resource')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- 2. The project (Time's project, grown up).
ALTER TABLE "staffing_clients" ADD CONSTRAINT "staffing_clients_org_id_key" UNIQUE ("organization_id", "id");

ALTER TABLE "timesheet_projects"
  ADD COLUMN "client_id" UUID,
  ADD COLUMN "billing_model" VARCHAR(15) NOT NULL DEFAULT 'non_billable',
  ADD COLUMN "status" VARCHAR(10) NOT NULL DEFAULT 'active',
  ADD COLUMN "start_on" DATE,
  ADD COLUMN "end_on" DATE,
  ADD COLUMN "budget_hours" NUMERIC(10, 2),
  ADD COLUMN "budget_cost" NUMERIC(14, 2),
  ADD COLUMN "fee" NUMERIC(14, 2),
  ADD COLUMN "client_accepts_milestones" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "burn_alerted_pct" SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN "closed_at" TIMESTAMPTZ(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "timesheet_projects_client_fkey" FOREIGN KEY ("organization_id", "client_id") REFERENCES "staffing_clients"("organization_id", "id"),
  ADD CONSTRAINT "timesheet_projects_model_check" CHECK ("billing_model" IN ('time_material', 'fixed_fee', 'retainer', 'non_billable')),
  ADD CONSTRAINT "timesheet_projects_status_check" CHECK ("status" IN ('draft', 'active', 'on_hold', 'closed')),
  ADD CONSTRAINT "timesheet_projects_dates_check" CHECK ("end_on" IS NULL OR "start_on" IS NULL OR "end_on" >= "start_on"),
  ADD CONSTRAINT "timesheet_projects_budgets_check" CHECK (coalesce("budget_hours", 0) >= 0 AND coalesce("budget_cost", 0) >= 0 AND coalesce("fee", 0) >= 0),
  -- A billable project has a client; a non-billable one may be internal.
  ADD CONSTRAINT "timesheet_projects_client_check" CHECK ("billing_model" = 'non_billable' OR "client_id" IS NOT NULL OR "status" = 'draft'),
  -- Only an active project takes time (Time's own rule, kept in step).
  ADD CONSTRAINT "timesheet_projects_active_check" CHECK ("active" = ("status" = 'active'));

-- Time's projects carry over: billable ones become time and material; switched-off ones closed.
UPDATE "timesheet_projects" SET
  "status" = CASE WHEN "active" THEN 'active' ELSE 'closed' END,
  "billing_model" = 'non_billable',
  "closed_at" = CASE WHEN "active" THEN NULL ELSE "updated_at" END;
-- (A billable Time project has no client yet, so it starts non-billable in Projects; the billable flag on its lines is
--  unchanged, and the project manager chooses the client and the model in Projects.)

-- ---------------------------------------------------------------------------------------------
-- 3. Allocations, tasks and milestones.
CREATE TABLE "project_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" VARCHAR(80),
    "from_on" DATE NOT NULL,
    "to_on" DATE,
    "percent" SMALLINT NOT NULL,
    "tentative" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_allocations_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "project_allocations_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_allocations_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "project_allocations_percent_check" CHECK ("percent" BETWEEN 1 AND 100),
    CONSTRAINT "project_allocations_dates_check" CHECK ("to_on" IS NULL OR "to_on" >= "from_on")
);
CREATE INDEX "project_allocations_project_idx" ON "project_allocations" ("organization_id", "project_id");
CREATE INDEX "project_allocations_employee_idx" ON "project_allocations" ("organization_id", "employee_id", "from_on");

CREATE TABLE "project_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "budget_hours" NUMERIC(10, 2),
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_tasks_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "project_tasks_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_tasks_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
    CONSTRAINT "project_tasks_budget_check" CHECK ("budget_hours" IS NULL OR "budget_hours" >= 0)
);
CREATE UNIQUE INDEX "project_tasks_name_key" ON "project_tasks" ("organization_id", "project_id", lower("name"));

CREATE TABLE "project_milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "pct" NUMERIC(5, 2) NOT NULL,
    "due_on" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'planned',
    "completed_at" TIMESTAMPTZ(3),
    "completed_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_milestones_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "project_milestones_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_milestones_pct_check" CHECK ("pct" > 0 AND "pct" <= 100),
    CONSTRAINT "project_milestones_status_check" CHECK ("status" IN ('planned', 'completed', 'accepted', 'invoiced')),
    CONSTRAINT "project_milestones_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120)
);
CREATE INDEX "project_milestones_project_idx" ON "project_milestones" ("organization_id", "project_id");

-- Time's activities become the project's tasks (the timesheet grid keeps showing them as activities).
INSERT INTO "project_tasks" ("organization_id", "project_id", "name", "billable")
SELECT p."organization_id", p."id", a.name, p."billable"
FROM "timesheet_projects" p CROSS JOIN LATERAL (SELECT DISTINCT btrim(x) AS name FROM unnest(p."activities") x WHERE btrim(x) <> '') a
ON CONFLICT DO NOTHING;

-- Company isolation (forced), and a portal session reads none of it (as Time's tables).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_allocations', 'project_tasks', 'project_milestones']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format('CREATE POLICY portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 4. Companies that already keep Time's projects get Projects switched on (their editor moves there).
INSERT INTO "settings" ("organization_id", "scope_type", "scope_id", "key", "value")
SELECT DISTINCT p."organization_id", 'tenant', p."organization_id", 'projects.enabled', '"on"'::jsonb
FROM "timesheet_projects" p
WHERE NOT EXISTS (SELECT 1 FROM "settings" s WHERE s."organization_id" = p."organization_id" AND s."key" = 'projects.enabled' AND s."scope_type" = 'tenant');
