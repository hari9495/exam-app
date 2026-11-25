-- Projects P-3, timesheet mapping rules (PRJ-08; founder answers 1409, 1410; 12 Nov 2026).
-- Company rules turn a work-tool item (a calendar event, an issue, code activity) into a suggested timesheet line for a
-- project and task, by priority (lower first). The person still reviews and submits; pre-fill stays off by default.
-- Writes no data; super admin set as every migration here does.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_org_id_key" UNIQUE ("organization_id", "id");

CREATE TABLE "project_mapping_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "pattern" VARCHAR(120) NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "priority" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_mapping_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_mapping_rules_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "project_mapping_rules_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_mapping_rules_task_fkey" FOREIGN KEY ("organization_id", "task_id") REFERENCES "project_tasks"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "project_mapping_rules_source_check" CHECK ("source" IN ('calendar', 'issues', 'code')),
    CONSTRAINT "project_mapping_rules_pattern_check" CHECK (char_length(btrim("pattern")) BETWEEN 1 AND 120),
    CONSTRAINT "project_mapping_rules_priority_check" CHECK ("priority" BETWEEN 1 AND 999)
);
CREATE INDEX "project_mapping_rules_order_idx" ON "project_mapping_rules" ("organization_id", "priority", "created_at");

ALTER TABLE "project_mapping_rules" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "project_mapping_rules"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "project_mapping_rules" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
