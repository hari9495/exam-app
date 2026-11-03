-- Performance "live, gap" pieces (3 Nov 2026). Forward only; no data is changed, so no row is rewritten here.

-- ---------------------------------------------------------------------------------------------- PRF-01 HR home snapshot
-- Founder answer (b): the HR home's numbers once a month, so the stat cards show the change against last month.
-- One row per company and month; the daily job writes the current month's row again until the month ends, so the
-- row of a past month holds that month's last figures. pips_active is shown only to HR with perf.pip.manage.
CREATE TABLE "perf_home_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "cycles_running" INTEGER NOT NULL,
    "overdue_stages" INTEGER NOT NULL,
    "pips_active" INTEGER NOT NULL,
    "goals_aligned" INTEGER,
    "taken_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "perf_home_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perf_home_snapshots_month_key" UNIQUE ("organization_id", "month"),
    CONSTRAINT "perf_home_snapshots_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "perf_home_snapshots_first_day_check" CHECK (EXTRACT(DAY FROM "month") = 1),
    CONSTRAINT "perf_home_snapshots_aligned_check" CHECK ("goals_aligned" IS NULL OR "goals_aligned" BETWEEN 0 AND 100)
);

ALTER TABLE "perf_home_snapshots" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "perf_home_snapshots"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "perf_home_snapshots" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
REVOKE DELETE, TRUNCATE ON TABLE "perf_home_snapshots" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- PRF-13 reassign to HR
-- HR takes a hand-over decision off the new manager (bulk "Reassign to HR"); who and when stay on the row.
ALTER TABLE "perf_owner_transfers"
  ADD COLUMN "with_hr_at" TIMESTAMPTZ(3),
  ADD COLUMN "with_hr_by" UUID,
  ADD CONSTRAINT "perf_owner_transfers_with_hr_check" CHECK (("with_hr_at" IS NULL) = ("with_hr_by" IS NULL));

-- ---------------------------------------------------------------------------------------------- PRF-14 skills test link
-- A competency may name one question-bank tag of the same company as its skills test (checked by the service).
ALTER TABLE "competencies" ADD COLUMN "question_tag_id" UUID;
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_question_tag_fkey" FOREIGN KEY ("question_tag_id") REFERENCES "tags"("id") ON DELETE SET NULL;

-- ---------------------------------------------------------------------------------------------- PRF-04 calibration in set-up
-- Calibration sessions planned in the cycle wizard (name, facilitator, departments); made at launch.
ALTER TABLE "review_cycles" ADD COLUMN "calibration_plan" JSONB;

-- ---------------------------------------------------------------------------------------------- PRF-12 extend after not met
-- Founder answer (a): after "not met", HR may extend the plan once more (perf.pip.after_not_met_days, with a reason).
ALTER TABLE "pips"
  ADD COLUMN "reextended_from" DATE,
  ADD COLUMN "reextend_reason" VARCHAR(1000),
  ADD COLUMN "reextended_by" UUID,
  ADD COLUMN "reextended_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "pips_reextended_check" CHECK (("reextended_at" IS NULL) = ("reextend_reason" IS NULL));
