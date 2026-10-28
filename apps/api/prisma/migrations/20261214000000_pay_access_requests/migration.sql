-- Founder decisions 28 Oct 2026: a manager asks to see their team's pay (the whole team or one named person) with a
-- reason. Two different HR people approve (neither of them the manager); the company sets how long access lasts and
-- the default scope, and the approver may change both. On the second approval a time-limited employee.salary.view
-- grant covers only the approved people; it ends by itself (valid_to).

-- Approving those requests has its own key (HR Admin).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'employee.pay_access.approve', 'Approve or refuse a manager request to see their team pay (two HR people approve each)')
ON CONFLICT DO NOTHING;

-- A grant may cover one of the grantee's reports by name ('one_report'): only that person, only while they report to them.
ALTER TABLE "role_grants" ADD COLUMN "employee_id" UUID;
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id");
ALTER TABLE "role_grants" DROP CONSTRAINT "role_grants_scope_check";
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_scope_check" CHECK ("scope_type" IN ('tenant', 'legal_entity', 'location', 'department_subtree', 'all_reports', 'direct_reports', 'one_report'));
ALTER TABLE "role_grants" DROP CONSTRAINT "role_grants_target_check";
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_target_check" CHECK (
    ("legal_entity_id" IS NOT NULL) = ("scope_type" = 'legal_entity')
    AND ("location_id" IS NOT NULL) = ("scope_type" = 'location')
    AND ("department_id" IS NOT NULL) = ("scope_type" = 'department_subtree')
    AND ("employee_id" IS NOT NULL) = ("scope_type" = 'one_report'));

CREATE OR REPLACE FUNCTION yx_scope_periods(p_org UUID, p_employee UUID, p_type TEXT, p_target UUID, p_viewer UUID)
RETURNS datemultirange LANGUAGE plpgsql STABLE AS $$
DECLARE r datemultirange;
BEGIN
  IF p_type = 'tenant' THEN
    RETURN datemultirange(daterange(NULL, NULL));
  ELSIF p_type = 'legal_entity' THEN
    SELECT range_agg(daterange(m.joined_on, m.exited_on, '[]')) INTO r FROM employments m
    WHERE m.organization_id = p_org AND m.employee_id = p_employee AND m.legal_entity_id = p_target;
  ELSIF p_type = 'location' THEN
    SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]')) INTO r FROM employee_assignments a
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND a.location_id = p_target;
  ELSIF p_type = 'department_subtree' THEN
    SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]')) INTO r
    FROM employee_assignments a
    JOIN departments d ON d.organization_id = a.organization_id AND d.id = a.department_id
    JOIN departments root ON root.organization_id = a.organization_id AND root.id = p_target
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND starts_with(d.path, root.path);
  ELSIF p_type = 'direct_reports' THEN
    SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]')) INTO r FROM employee_assignments a
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND a.manager_employee_id = p_viewer;
  ELSIF p_type = 'dotted_line' THEN
    SELECT range_agg(daterange(a.valid_from, a.valid_to, '[]')) INTO r
    FROM employee_assignments a
    JOIN assignment_dotted_line_managers x ON x.organization_id = a.organization_id AND x.assignment_id = a.id
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND x.manager_employee_id = p_viewer;
  ELSIF p_type = 'all_reports' THEN
    WITH RECURSIVE up(manager_id, period, depth) AS (
      SELECT a.manager_employee_id, daterange(a.valid_from, a.valid_to, '[]'), 1
      FROM employee_assignments a
      WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
      UNION ALL
      SELECT a.manager_employee_id, up.period * daterange(a.valid_from, a.valid_to, '[]'), up.depth + 1
      FROM up JOIN employee_assignments a
        ON a.organization_id = p_org AND a.employee_id = up.manager_id AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
       AND daterange(a.valid_from, a.valid_to, '[]') && up.period
      WHERE up.depth < 50 AND up.manager_id <> p_viewer AND up.manager_id <> p_employee
    )
    SELECT range_agg(period) INTO r FROM up WHERE manager_id = p_viewer;
  ELSIF p_type = 'one_report' THEN
    -- The named person only, and only for the periods they sat anywhere below the viewer.
    IF p_employee IS DISTINCT FROM p_target THEN
      RETURN '{}'::datemultirange;
    END IF;
    RETURN yx_scope_periods(p_org, p_employee, 'all_reports', NULL, p_viewer);
  ELSE
    RAISE EXCEPTION 'unknown scope type %', p_type USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN COALESCE(r, '{}'::datemultirange);
END $$;

CREATE TABLE "pay_access_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "manager_employee_id" UUID NOT NULL,
    "scope" VARCHAR(10) NOT NULL,
    "employee_id" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "days" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "first_by" UUID,
    "first_at" TIMESTAMPTZ(3),
    "first_note" VARCHAR(500),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "grant_id" UUID,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pay_access_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_access_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_access_requests_requester_fkey" FOREIGN KEY ("organization_id", "requested_by") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "pay_access_requests_manager_fkey" FOREIGN KEY ("organization_id", "manager_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "pay_access_requests_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "pay_access_requests_grant_fkey" FOREIGN KEY ("grant_id") REFERENCES "role_grants"("id"),
    CONSTRAINT "pay_access_requests_scope_check" CHECK ("scope" IN ('team', 'person') AND ("employee_id" IS NOT NULL) = ("scope" = 'person')),
    CONSTRAINT "pay_access_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
    CONSTRAINT "pay_access_requests_days_check" CHECK ("days" BETWEEN 1 AND 366),
    CONSTRAINT "pay_access_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'refused')),
    CONSTRAINT "pay_access_requests_approved_check" CHECK (("status" = 'approved') = ("grant_id" IS NOT NULL AND "valid_to" IS NOT NULL AND "first_by" IS NOT NULL)),
    CONSTRAINT "pay_access_requests_decided_check" CHECK (("status" = 'pending') = ("decided_by" IS NULL)),
    -- Two different HR people, neither of them the manager who asked.
    CONSTRAINT "pay_access_requests_four_eyes_check" CHECK (
        ("first_by" IS NULL OR "first_by" <> "requested_by")
        AND ("decided_by" IS NULL OR ("decided_by" <> "requested_by" AND "decided_by" IS DISTINCT FROM "first_by")))
);
-- One open request per manager at a time.
CREATE UNIQUE INDEX "pay_access_requests_open_key" ON "pay_access_requests"("organization_id", "requested_by") WHERE "status" = 'pending';
CREATE INDEX "pay_access_requests_status_idx" ON "pay_access_requests"("organization_id", "status", "created_at");
REVOKE DELETE, TRUNCATE ON TABLE "pay_access_requests" FROM app_runtime;

ALTER TABLE "pay_access_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pay_access_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- Pay access is never seen or decided from a YukthiX support session (P02 Q8).
CREATE POLICY support_session_excluded ON "pay_access_requests" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
