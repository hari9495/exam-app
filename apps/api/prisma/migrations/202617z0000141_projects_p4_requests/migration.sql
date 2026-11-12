-- Projects P-4, resource requests (PRJ-07; founder answers 1417, 1418; 12 Nov 2026). A project manager asks for a share
-- of someone's week for some dates and a role; Projects resource (or manage) fills it with a person who has that much
-- free capacity (skills later, 1418), which creates the allocation. The one bench stays Staffing desk › Bench (1417).
-- Writes no data; super admin set as every migration here does.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_org_id_key" UNIQUE ("organization_id", "id");

CREATE TABLE "project_resource_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "role" VARCHAR(80) NOT NULL,
    "percent" SMALLINT NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    "note" VARCHAR(500),
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "requested_by" UUID,
    "filled_employee_id" UUID,
    "allocation_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_resource_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_resource_requests_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "project_resource_requests_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_resource_requests_employee_fkey" FOREIGN KEY ("organization_id", "filled_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "project_resource_requests_allocation_fkey" FOREIGN KEY ("organization_id", "allocation_id") REFERENCES "project_allocations"("organization_id", "id"),
    CONSTRAINT "project_resource_requests_percent_check" CHECK ("percent" BETWEEN 1 AND 100),
    CONSTRAINT "project_resource_requests_dates_check" CHECK ("to_on" >= "from_on"),
    CONSTRAINT "project_resource_requests_status_check" CHECK ("status" IN ('open', 'filled', 'withdrawn')),
    CONSTRAINT "project_resource_requests_role_check" CHECK (char_length(btrim("role")) BETWEEN 1 AND 80)
);
CREATE INDEX "project_resource_requests_idx" ON "project_resource_requests" ("organization_id", "status", "from_on");

ALTER TABLE "project_resource_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "project_resource_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "project_resource_requests" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
