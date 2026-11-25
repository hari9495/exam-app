-- TIM-07 Ot (Nov 2026): overtime asked for ahead of the work (date, planned hours, paid or comp-off, a reason). The
-- employee asks and the manager approves through P03, or the manager plans it for a report (approved at once). A later
-- claim reads the approved plan (attendance.overtime.pre_approval: refuse, flag or allow a claim without one).
CREATE TABLE "overtime_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "planned_minutes" SMALLINT NOT NULL,
    "take_as" VARCHAR(8) NOT NULL DEFAULT 'pay',
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "raised_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "overtime_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "overtime_plans_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "overtime_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "overtime_plans_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "overtime_plans_minutes_check" CHECK ("planned_minutes" BETWEEN 30 AND 720 AND "planned_minutes" % 15 = 0),
    CONSTRAINT "overtime_plans_take_as_check" CHECK ("take_as" IN ('pay', 'comp_off')),
    CONSTRAINT "overtime_plans_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
    CONSTRAINT "overtime_plans_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500)
);
-- One live plan per person and day (a second while one waits or is approved is refused).
CREATE UNIQUE INDEX "overtime_plans_one_live_idx" ON "overtime_plans" ("organization_id", "employee_id", "work_on") WHERE "status" IN ('pending', 'approved');

ALTER TABLE "overtime_plans" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "overtime_plans"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "overtime_plans" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
REVOKE DELETE, TRUNCATE ON TABLE "overtime_plans" FROM app_runtime;

-- The claim keeps what was pre-approved when it was raised (null: no pre-approval).
ALTER TABLE "overtime_requests" ADD COLUMN "plan_id" UUID;
ALTER TABLE "overtime_requests" ADD COLUMN "pre_approved_minutes" SMALLINT;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_plan_fkey" FOREIGN KEY ("organization_id", "plan_id") REFERENCES "overtime_plans"("organization_id", "id");
