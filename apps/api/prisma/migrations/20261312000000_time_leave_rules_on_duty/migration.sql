-- Time leave rules and on duty (Nov 2026, branch feat/yukthix-time-leave-rules).
-- TIM-03 / TIM-07 OnDuty: an employee asks to mark a day, or part of it, as on duty away from the office (a place and
-- times); the manager approves it through P03 and may send it back for changes. It is an attendance request of its own kind.
ALTER TABLE "attendance_requests" DROP CONSTRAINT "attendance_requests_kind_check";
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_kind_check" CHECK ("kind" IN ('missed_in', 'missed_out', 'wrong_time', 'full_day', 'wfh', 'on_duty'));
ALTER TABLE "attendance_requests" DROP CONSTRAINT "attendance_requests_status_check";
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'sent_back', 'resent'));
ALTER TABLE "attendance_requests" ADD COLUMN "place" VARCHAR(120);
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_on_duty_check" CHECK (
  "kind" <> 'on_duty' OR ("place" IS NOT NULL AND char_length(btrim("place")) BETWEEN 2 AND 120 AND "in_minute" IS NOT NULL AND "out_minute" IS NOT NULL AND "out_minute" > "in_minute"));
CREATE INDEX "attendance_requests_on_duty_idx" ON "attendance_requests"("organization_id", "employee_id", "work_on") WHERE "kind" = 'on_duty' AND "status" IN ('pending', 'approved');

-- TIM-29 Transition: a scheduled change of the leave year for the company or one legal entity. From from_on a short
-- year runs to the day before the new start month; full years follow. Once per company / entity and date.
CREATE TABLE "leave_year_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID,
    "from_on" DATE NOT NULL,
    "old_start_month" SMALLINT NOT NULL,
    "new_start_month" SMALLINT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_year_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_year_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_year_changes_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "leave_year_changes_months_check" CHECK ("old_start_month" BETWEEN 1 AND 12 AND "new_start_month" BETWEEN 1 AND 12 AND "old_start_month" <> "new_start_month"),
    CONSTRAINT "leave_year_changes_from_check" CHECK (EXTRACT(DAY FROM "from_on") = 1)
);
CREATE UNIQUE INDEX "leave_year_changes_once_idx" ON "leave_year_changes" ("organization_id", COALESCE("legal_entity_id", '00000000-0000-0000-0000-000000000000'::uuid), "from_on");

-- TIM-29: each posted year end, once per leave policy and last day of the year (a second run is refused).
CREATE TABLE "leave_year_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "year_end" DATE NOT NULL,
    "policy_id" UUID NOT NULL,
    "totals" JSONB NOT NULL DEFAULT '{}',
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_year_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_year_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_year_runs_policy_fkey" FOREIGN KEY ("organization_id", "policy_id") REFERENCES "leave_policies"("organization_id", "id")
);
CREATE UNIQUE INDEX "leave_year_runs_once_idx" ON "leave_year_runs" ("organization_id", "year_end", "policy_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leave_year_changes', 'leave_year_runs']
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
-- Posted records are never changed or removed: a correction is a new adjustment.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "leave_year_changes", "leave_year_runs" FROM app_runtime;
