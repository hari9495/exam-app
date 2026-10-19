-- Home parity with the design (PLT-02, 19 Oct 2026).

-- 1. Who an approval is about. The inbox row names this person (with their avatar) even when HR raised the request or
-- the request came from an import with no login behind it. Rows from before carry it where the subject says who.
ALTER TABLE "wf_requests" ADD COLUMN "subject_person_id" UUID;

UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "leave_requests" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'leave_request' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "attendance_requests" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'attendance_request' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "overtime_requests" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'overtime_request' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "timesheets" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'timesheet' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "expense_claims" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'expense_claim' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "trips" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'trip' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = s."person_id"
FROM "exit_cases" s
WHERE r."subject_type" = 'exit_case' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;

-- 2. Home count cards: the month's number, kept so next month can say "vs last month". The last run in a month
-- stands for the month. scope_id is a legal entity or a help desk (NULL = the whole company); compared only for a
-- viewer who sees everything the stored number covers.
CREATE TABLE "home_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "metric" VARCHAR(30) NOT NULL,
    "scope_id" UUID,
    "month" DATE NOT NULL,
    "value" INTEGER NOT NULL,
    "taken_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "home_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "home_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "home_snapshots_month_check" CHECK (extract(day FROM "month") = 1),
    CONSTRAINT "home_snapshots_metric_check" CHECK ("metric" IN ('attendance_exceptions', 'not_ready_payroll', 'open_cases', 'joining'))
);
CREATE UNIQUE INDEX "home_snapshots_scope_month_key" ON "home_snapshots"("organization_id", "metric", COALESCE("scope_id", '00000000-0000-0000-0000-000000000000'::uuid), "month");

ALTER TABLE "home_snapshots" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "home_snapshots"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
